use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeSet, HashMap},
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tokio::{fs, io::AsyncWriteExt};
use walkdir::WalkDir;

const UI_HTML: &str = include_str!("ui.html");
const UI_CSS: &str = include_str!("ui.css");
const UI_JS: &str = include_str!("ui.js");

#[derive(Clone)]
pub struct AppState {
    pub root: Arc<PathBuf>,
    pub cors: Arc<Vec<String>>,
    pub events: Option<String>,
    client: reqwest::Client,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Sidecar {
    #[serde(default)]
    content_type: Option<String>,
    #[serde(default)]
    metadata: HashMap<String, String>,
    #[serde(default)]
    tags: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
struct ObjectInfo {
    key: String,
    size: u64,
    modified: String,
    content_type: String,
}

#[derive(Debug, Serialize)]
struct BucketInfo {
    name: String,
    objects: usize,
    bytes: u64,
}

#[derive(Debug, Serialize)]
struct EventRecord {
    #[serde(rename = "eventName")]
    event_name: String,
    #[serde(rename = "eventTime")]
    event_time: String,
    s3: EventS3,
}
#[derive(Debug, Serialize)]
struct EventS3 {
    bucket: EventBucket,
    object: EventObject,
}
#[derive(Debug, Serialize)]
struct EventBucket {
    name: String,
}
#[derive(Debug, Serialize)]
struct EventObject {
    key: String,
    size: u64,
    #[serde(rename = "eTag")]
    etag: String,
}

pub fn app(root: PathBuf, cors: Vec<String>, events: Option<String>) -> Router {
    // The CLI creates the directory before building the router. Keeping this
    // canonical form in state gives every subsequent containment check one
    // stable root to compare against, even when the user supplied a relative
    // directory on the command line.
    let root = std::fs::canonicalize(&root).unwrap_or(root);
    let state = AppState {
        root: Arc::new(root),
        cors: Arc::new(cors),
        events,
        client: reqwest::Client::new(),
    };
    Router::new()
        // Keep Chromium from emitting a 404 console error for its automatic
        // favicon probe when the local console is opened.
        .route("/favicon.ico", get(favicon))
        .route("/ui", get(ui_html))
        .route("/ui/", get(ui_html))
        .route("/ui/app.css", get(ui_css))
        .route("/ui/app.js", get(ui_js))
        .fallback(handle)
        .with_state(state)
}

async fn favicon() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn ui_html() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        UI_HTML,
    )
}
async fn ui_css() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/css; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        UI_CSS,
    )
}
async fn ui_js() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/javascript; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        UI_JS,
    )
}

async fn handle(State(state): State<AppState>, req: Request) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let headers = req.headers().clone();
    let raw_path = uri.path();
    if method == Method::OPTIONS {
        return cors_response(&state, &headers, StatusCode::NO_CONTENT.into_response());
    }
    let result = if raw_path.starts_with("/_s3dir/api") {
        api_handle(
            &state,
            method,
            raw_path,
            uri.query(),
            headers.clone(),
            req.into_body(),
        )
        .await
    } else {
        s3_handle(
            &state,
            method,
            raw_path,
            uri.query(),
            headers.clone(),
            req.into_body(),
        )
        .await
    };
    cors_response(&state, &headers, result)
}

fn cors_response(
    state: &AppState,
    request_headers: &HeaderMap,
    mut response: Response,
) -> Response {
    let origin = request_headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok());
    if let Some(origin) = origin
        && state
            .cors
            .iter()
            .any(|allowed| allowed == "*" || allowed == origin)
    {
        if let Ok(v) = HeaderValue::from_str(origin) {
            response
                .headers_mut()
                .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, v);
        }
        response
            .headers_mut()
            .insert(header::VARY, HeaderValue::from_static("Origin"));
    }
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET,HEAD,PUT,POST,DELETE,OPTIONS"),
    );
    let requested = request_headers
        .get(header::ACCESS_CONTROL_REQUEST_HEADERS)
        .cloned()
        .unwrap_or_else(|| {
            HeaderValue::from_static(
                "authorization,content-type,x-amz-content-sha256,x-amz-date,x-amz-tagging",
            )
        });
    response
        .headers_mut()
        .insert(header::ACCESS_CONTROL_ALLOW_HEADERS, requested);
    response.headers_mut().insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("etag,content-length,content-type,x-amz-meta-*"),
    );
    response
}

async fn s3_handle(
    state: &AppState,
    method: Method,
    raw_path: &str,
    query: Option<&str>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let decoded = match percent_decode_str(raw_path.trim_start_matches('/')).decode_utf8() {
        Ok(v) => v.to_string(),
        Err(_) => {
            return s3_error(
                StatusCode::BAD_REQUEST,
                "InvalidURI",
                "The URI could not be decoded",
            );
        }
    };
    let mut split = decoded.splitn(2, '/');
    let bucket = split.next().unwrap_or("");
    let key = split.next();
    let params = query_params(query);
    if bucket.is_empty() {
        return if method == Method::GET {
            list_buckets(state).await
        } else {
            s3_error(
                StatusCode::METHOD_NOT_ALLOWED,
                "MethodNotAllowed",
                "Use GET to list buckets",
            )
        };
    }
    if !valid_bucket(bucket) {
        return s3_error(
            StatusCode::BAD_REQUEST,
            "InvalidBucketName",
            "Bucket names must be 3–63 safe characters",
        );
    }
    if key.is_none() || key == Some("") {
        return bucket_request(state, method, bucket, &params).await;
    }
    let key = key.unwrap();
    let object = match safe_object_path(&state.root, bucket, key) {
        Some(path) => path,
        None => {
            return s3_error(
                StatusCode::BAD_REQUEST,
                "InvalidObjectName",
                "Object keys cannot contain dot segments or .s3dir",
            );
        }
    };
    if params.contains_key("uploads") && method == Method::POST {
        return multipart_start(state, bucket, key).await;
    }
    if let Some(upload_id) = params.get("uploadId") {
        return multipart_request(
            state,
            method,
            bucket,
            key,
            upload_id,
            params.get("partNumber"),
            body,
        )
        .await;
    }
    if params.contains_key("tagging") {
        return tagging_request(state, method, bucket, key, &object, body).await;
    }
    match method {
        Method::PUT => put_object(state, bucket, key, object, headers, body).await,
        Method::GET => get_object(state, bucket, key, object, headers, false).await,
        Method::HEAD => get_object(state, bucket, key, object, headers, true).await,
        Method::DELETE => delete_object(state, bucket, key, object).await,
        _ => s3_error(
            StatusCode::METHOD_NOT_ALLOWED,
            "MethodNotAllowed",
            "Unsupported object operation",
        ),
    }
}

fn valid_bucket(bucket: &str) -> bool {
    (3..=63).contains(&bucket.len())
        && bucket
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')
        && !bucket.starts_with('.')
        && !bucket.ends_with('.')
}

fn safe_object_path(root: &Path, bucket: &str, key: &str) -> Option<PathBuf> {
    if !valid_bucket(bucket) {
        return None;
    }
    let rel = Path::new(key);
    if key.is_empty()
        || key.starts_with('/')
        || rel.components().any(|c| !matches!(c, Component::Normal(_)))
        || key.split('/').any(|p| p == ".s3dir")
    {
        return None;
    }
    let path = root.join(bucket).join(rel);
    path.strip_prefix(root).ok()?;
    Some(path)
}

fn safe_bucket_path(root: &Path, bucket: &str) -> Option<PathBuf> {
    if !valid_bucket(bucket) {
        return None;
    }
    let path = root.join(bucket);
    path.strip_prefix(root).ok()?;
    Some(path)
}

fn canonically_contained(root: &Path, path: &Path) -> Option<PathBuf> {
    let canonical = std::fs::canonicalize(path).ok()?;
    canonical.strip_prefix(root).ok()?;
    Some(canonical)
}

async fn existing_bucket_path(state: &AppState, bucket: &str) -> Option<PathBuf> {
    let path = safe_bucket_path(&state.root, bucket)?;
    let metadata = fs::symlink_metadata(&path).await.ok()?;
    if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
        return None;
    }
    let canonical = canonically_contained(&state.root, &path)?;
    (canonical.parent() == Some(state.root.as_ref())).then_some(canonical)
}

async fn existing_object_path(state: &AppState, bucket: &str, key: &str) -> Option<PathBuf> {
    let candidate = safe_object_path(&state.root, bucket, key)?;
    existing_bucket_path(state, bucket).await?;
    let metadata = fs::symlink_metadata(&candidate).await.ok()?;
    if metadata.file_type().is_symlink() {
        return None;
    }
    canonically_contained(&state.root, &candidate)
}

enum ObjectWritePathError {
    KeyPathConflict,
    Unsafe,
}

/// Creates missing object parent directories one component at a time.  This
/// rejects an existing symlink before traversing it and verifies the
/// canonical location after each creation, so a key can never cause normal
/// request handling to create files outside the configured root.
async fn object_path_for_write(
    state: &AppState,
    bucket: &str,
    key: &str,
) -> Result<PathBuf, ObjectWritePathError> {
    let candidate =
        safe_object_path(&state.root, bucket, key).ok_or(ObjectWritePathError::Unsafe)?;
    let mut current = existing_bucket_path(state, bucket)
        .await
        .ok_or(ObjectWritePathError::Unsafe)?;
    let rel = Path::new(key);
    let parent = rel.parent().ok_or(ObjectWritePathError::Unsafe)?;
    for component in parent.components() {
        let Component::Normal(name) = component else {
            return Err(ObjectWritePathError::Unsafe);
        };
        let next = current.join(name);
        match fs::symlink_metadata(&next).await {
            Ok(metadata) if metadata.file_type().is_dir() && !metadata.file_type().is_symlink() => {
            }
            // An ordinary object file already occupies a required parent
            // directory (for example, `foo` before `foo/bar`).  This is the
            // documented POSIX key-path conflict, not malformed input.
            Ok(metadata) if metadata.file_type().is_file() => {
                return Err(ObjectWritePathError::KeyPathConflict);
            }
            Ok(_) => return Err(ObjectWritePathError::Unsafe),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                match fs::create_dir(&next).await {
                    Ok(()) => {}
                    // A concurrent PUT may create this same shared parent
                    // after the metadata check above. It is still safe only
                    // if the winner made an ordinary directory inside root.
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                        match fs::symlink_metadata(&next).await {
                            Ok(metadata)
                                if metadata.file_type().is_dir()
                                    && !metadata.file_type().is_symlink() => {}
                            Ok(metadata) if metadata.file_type().is_file() => {
                                return Err(ObjectWritePathError::KeyPathConflict);
                            }
                            Ok(_) | Err(_) => return Err(ObjectWritePathError::Unsafe),
                        }
                    }
                    Err(_) => return Err(ObjectWritePathError::Unsafe),
                }
            }
            Err(_) => return Err(ObjectWritePathError::Unsafe),
        }
        current = canonically_contained(&state.root, &next).ok_or(ObjectWritePathError::Unsafe)?;
    }
    let path = current.join(rel.file_name().ok_or(ObjectWritePathError::Unsafe)?);
    if let Ok(metadata) = fs::symlink_metadata(&path).await
        && (metadata.file_type().is_symlink()
            || canonically_contained(&state.root, &path).is_none())
    {
        return Err(ObjectWritePathError::Unsafe);
    }
    // `candidate` is retained as a lexical containment assertion as well as
    // the component-by-component canonical verification above.
    candidate
        .strip_prefix(&*state.root)
        .map_err(|_| ObjectWritePathError::Unsafe)?;
    Ok(path)
}

async fn bucket_request(
    state: &AppState,
    method: Method,
    bucket: &str,
    params: &HashMap<String, String>,
) -> Response {
    let Some(path) = safe_bucket_path(&state.root, bucket) else {
        return s3_error(
            StatusCode::BAD_REQUEST,
            "InvalidBucketName",
            "Invalid bucket name",
        );
    };
    match method {
        Method::PUT => match fs::create_dir(&path).await {
            Ok(_) => StatusCode::OK.into_response(),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if existing_bucket_path(state, bucket).await.is_some() {
                    StatusCode::OK.into_response()
                } else {
                    s3_error(
                        StatusCode::BAD_REQUEST,
                        "InvalidBucketName",
                        "Bucket is not a safe directory",
                    )
                }
            }
            Err(e) => io_error(e),
        },
        Method::HEAD => {
            if existing_bucket_path(state, bucket).await.is_some() {
                StatusCode::OK.into_response()
            } else {
                s3_error(
                    StatusCode::NOT_FOUND,
                    "NoSuchBucket",
                    "Bucket does not exist",
                )
            }
        }
        Method::GET => list_objects(state, bucket, params).await,
        Method::DELETE => {
            let Some(path) = existing_bucket_path(state, bucket).await else {
                return s3_error(
                    StatusCode::NOT_FOUND,
                    "NoSuchBucket",
                    "Bucket does not exist",
                );
            };
            let non_internal = WalkDir::new(&path)
                .min_depth(1)
                .into_iter()
                .filter_map(Result::ok)
                .any(|e| {
                    !e.path().components().any(|c| c.as_os_str() == ".s3dir")
                        && e.file_type().is_file()
                });
            if non_internal {
                return s3_error(
                    StatusCode::CONFLICT,
                    "BucketNotEmpty",
                    "Remove all objects before deleting the bucket",
                );
            }
            match fs::remove_dir_all(path).await {
                Ok(_) => StatusCode::NO_CONTENT.into_response(),
                Err(e) => io_error(e),
            }
        }
        _ => s3_error(
            StatusCode::METHOD_NOT_ALLOWED,
            "MethodNotAllowed",
            "Unsupported bucket operation",
        ),
    }
}

async fn list_buckets(state: &AppState) -> Response {
    let mut names = vec![];
    if let Ok(mut entries) = fs::read_dir(&*state.root).await {
        while let Ok(Some(e)) = entries.next_entry().await {
            if e.file_name() != ".s3dir"
                && valid_bucket(&e.file_name().to_string_lossy())
                && e.file_type()
                    .await
                    .map(|t| t.is_dir() && !t.is_symlink())
                    .unwrap_or(false)
                && canonically_contained(&state.root, &e.path())
                    .is_some_and(|p| p.parent() == Some(state.root.as_ref()))
            {
                names.push(e.file_name().to_string_lossy().to_string());
            }
        }
    }
    names.sort();
    let buckets = names
        .into_iter()
        .map(|n| {
            format!(
                "<Bucket><Name>{}</Name><CreationDate>1970-01-01T00:00:00Z</CreationDate></Bucket>",
                xml(&n)
            )
        })
        .collect::<String>();
    xml_response(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ListAllMyBucketsResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Owner><ID>local</ID><DisplayName>local</DisplayName></Owner><Buckets>{buckets}</Buckets></ListAllMyBucketsResult>"
    ))
}

fn collect_objects(bucket_path: &Path) -> Vec<ObjectInfo> {
    let mut out = vec![];
    for entry in WalkDir::new(bucket_path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file()
            || entry.path().components().any(|c| c.as_os_str() == ".s3dir")
        {
            continue;
        }
        let key = entry
            .path()
            .strip_prefix(bucket_path)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let meta = entry.metadata().ok();
        let modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .map(DateTime::<Utc>::from)
            .unwrap_or_else(Utc::now)
            .to_rfc3339();
        out.push(ObjectInfo {
            key,
            size: meta.map(|m| m.len()).unwrap_or(0),
            modified,
            content_type: mime_guess::from_path(entry.path())
                .first_or_octet_stream()
                .to_string(),
        });
    }
    out.sort_by(|a, b| a.key.cmp(&b.key));
    out
}

async fn list_objects(
    state: &AppState,
    bucket: &str,
    params: &HashMap<String, String>,
) -> Response {
    let Some(bucket_path) = existing_bucket_path(state, bucket).await else {
        return s3_error(
            StatusCode::NOT_FOUND,
            "NoSuchBucket",
            "Bucket does not exist",
        );
    };
    let prefix = params.get("prefix").map(String::as_str).unwrap_or("");
    let delimiter = params.get("delimiter").map(String::as_str);
    let max = params
        .get("max-keys")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(1000)
        .min(1000);
    let token = params
        .get("continuation-token")
        .and_then(|v| URL_SAFE_NO_PAD.decode(v).ok())
        .and_then(|v| String::from_utf8(v).ok());
    let objects = collect_objects(&bucket_path);
    let filtered: Vec<_> = objects
        .iter()
        .filter(|o| o.key.starts_with(prefix) && token.as_ref().is_none_or(|t| o.key > *t))
        .collect();
    let truncated = filtered.len() > max;
    let page = filtered.into_iter().take(max).collect::<Vec<_>>();
    let mut common = BTreeSet::new();
    let mut contents = String::new();
    for o in &page {
        if let Some(d) = delimiter {
            let rest = &o.key[prefix.len()..];
            if let Some(pos) = rest.find(d) {
                common.insert(format!("{}{}{}", prefix, &rest[..pos], d));
                continue;
            }
        }
        contents.push_str(&format!("<Contents><Key>{}</Key><LastModified>{}</LastModified><ETag>&quot;{}&quot;</ETag><Size>{}</Size><StorageClass>STANDARD</StorageClass></Contents>", xml(&o.key), o.modified, etag_path(&bucket_path.join(&o.key)), o.size));
    }
    let common_xml = common
        .into_iter()
        .map(|p| {
            format!(
                "<CommonPrefixes><Prefix>{}</Prefix></CommonPrefixes>",
                xml(&p)
            )
        })
        .collect::<String>();
    let next = if truncated {
        page.last()
            .map(|o| {
                format!(
                    "<NextContinuationToken>{}</NextContinuationToken>",
                    URL_SAFE_NO_PAD.encode(o.key.as_bytes())
                )
            })
            .unwrap_or_default()
    } else {
        String::new()
    };
    xml_response(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ListBucketResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Name>{}</Name><Prefix>{}</Prefix><KeyCount>{}</KeyCount><MaxKeys>{}</MaxKeys><IsTruncated>{}</IsTruncated>{next}{contents}{common_xml}</ListBucketResult>",
        xml(bucket),
        xml(prefix),
        page.len(),
        max,
        truncated
    ))
}

async fn put_object(
    state: &AppState,
    bucket: &str,
    key: &str,
    _path: PathBuf,
    headers: HeaderMap,
    body: Body,
) -> Response {
    if existing_bucket_path(state, bucket).await.is_none() {
        return s3_error(
            StatusCode::NOT_FOUND,
            "NoSuchBucket",
            "Create the bucket first",
        );
    }
    let path = match object_path_for_write(state, bucket, key).await {
        Ok(path) => path,
        Err(ObjectWritePathError::KeyPathConflict) => {
            return s3_error(
                StatusCode::CONFLICT,
                "KeyPathConflict",
                "An object file already occupies a parent directory for this key",
            );
        }
        Err(ObjectWritePathError::Unsafe) => {
            return s3_error(
                StatusCode::BAD_REQUEST,
                "InvalidObjectName",
                "Object path is outside the configured directory or crosses a symlink",
            );
        }
    };
    if path.is_dir() {
        return s3_error(
            StatusCode::CONFLICT,
            "KeyPathConflict",
            "A directory already occupies this object key",
        );
    }
    let mut bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(v) => v,
        Err(_) => {
            return s3_error(
                StatusCode::BAD_REQUEST,
                "IncompleteBody",
                "Could not read request body",
            );
        }
    };
    if headers
        .get(header::CONTENT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(',').any(|part| part.trim() == "aws-chunked"))
    {
        bytes = match decode_aws_chunked(&bytes) {
            Some(decoded) => decoded.into(),
            None => {
                return s3_error(
                    StatusCode::BAD_REQUEST,
                    "InvalidRequest",
                    "Malformed aws-chunked request body",
                );
            }
        };
    }
    if let Err(e) = fs::write(&path, &bytes).await {
        return io_error(e);
    }
    let mut side = Sidecar {
        content_type: headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string),
        ..Default::default()
    };
    for (name, value) in &headers {
        if let Some(k) = name.as_str().strip_prefix("x-amz-meta-")
            && let Ok(v) = value.to_str()
        {
            side.metadata.insert(k.to_string(), v.to_string());
        }
    }
    if let Some(tags) = headers.get("x-amz-tagging").and_then(|v| v.to_str().ok()) {
        side.tags = parse_form(tags);
    }
    let _ = write_sidecar(state, bucket, key, &side).await;
    let etag = format!("{:x}", md5::compute(&bytes));
    notify(
        state,
        "s3:ObjectCreated:Put",
        bucket,
        key,
        bytes.len() as u64,
        &etag,
    );
    let mut response = StatusCode::OK.into_response();
    response.headers_mut().insert(
        header::ETAG,
        HeaderValue::from_str(&format!("\"{etag}\"")).unwrap(),
    );
    response
}

async fn get_object(
    state: &AppState,
    bucket: &str,
    key: &str,
    _path: PathBuf,
    headers: HeaderMap,
    head: bool,
) -> Response {
    let Some(path) = existing_object_path(state, bucket, key).await else {
        return s3_error(StatusCode::NOT_FOUND, "NoSuchKey", "Object does not exist");
    };
    let bytes = match fs::read(&path).await {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return s3_error(StatusCode::NOT_FOUND, "NoSuchKey", "Object does not exist");
        }
        Err(e) => return io_error(e),
    };
    let side = read_sidecar(state, bucket, key).await.unwrap_or_default();
    let total = bytes.len();
    let (status, data, range) = if !head {
        if let Some(r) = headers
            .get(header::RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| parse_range(v, total))
        {
            (
                StatusCode::PARTIAL_CONTENT,
                bytes[r.0..=r.1].to_vec(),
                Some(r),
            )
        } else {
            (StatusCode::OK, bytes, None)
        }
    } else {
        (StatusCode::OK, vec![], None)
    };
    let mut response = (status, Body::from(data)).into_response();
    let h = response.headers_mut();
    let content_type = side.content_type.unwrap_or_else(|| {
        mime_guess::from_path(&path)
            .first_or_octet_stream()
            .essence_str()
            .to_string()
    });
    h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&content_type).unwrap(),
    );
    h.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&range.map(|r| r.1 - r.0 + 1).unwrap_or(total).to_string()).unwrap(),
    );
    h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    h.insert(
        header::ETAG,
        HeaderValue::from_str(&format!("\"{}\"", etag_path(&path))).unwrap(),
    );
    if let Some((start, end)) = range {
        h.insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")).unwrap(),
        );
    }
    for (k, v) in side.metadata {
        if let (Ok(n), Ok(value)) = (
            header::HeaderName::try_from(format!("x-amz-meta-{k}")),
            HeaderValue::from_str(&v),
        ) {
            h.insert(n, value);
        }
    }
    response
}

async fn delete_object(state: &AppState, bucket: &str, key: &str, _path: PathBuf) -> Response {
    let Some(path) = existing_object_path(state, bucket, key).await else {
        return StatusCode::NO_CONTENT.into_response();
    };
    let size = fs::metadata(&path).await.map(|m| m.len()).unwrap_or(0);
    let etag = etag_path(&path);
    let _ = fs::remove_file(&path).await;
    if let Some(sidecar) = sidecar_path(state, bucket, key, false).await {
        let _ = fs::remove_file(sidecar).await;
    }
    notify(state, "s3:ObjectRemoved:Delete", bucket, key, size, &etag);
    StatusCode::NO_CONTENT.into_response()
}

async fn tagging_request(
    state: &AppState,
    method: Method,
    bucket: &str,
    key: &str,
    _path: &Path,
    body: Body,
) -> Response {
    let Some(_path) = existing_object_path(state, bucket, key).await else {
        return s3_error(StatusCode::NOT_FOUND, "NoSuchKey", "Object does not exist");
    };
    let mut side = read_sidecar(state, bucket, key).await.unwrap_or_default();
    match method {
        Method::GET => {
            let tags = side
                .tags
                .iter()
                .map(|(k, v)| format!("<Tag><Key>{}</Key><Value>{}</Value></Tag>", xml(k), xml(v)))
                .collect::<String>();
            xml_response(format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Tagging><TagSet>{tags}</TagSet></Tagging>"
            ))
        }
        Method::PUT => {
            let bytes = axum::body::to_bytes(body, 1024 * 1024)
                .await
                .unwrap_or_default();
            side.tags = parse_tag_xml(&String::from_utf8_lossy(&bytes));
            match write_sidecar(state, bucket, key, &side).await {
                Ok(_) => StatusCode::OK.into_response(),
                Err(e) => io_error(e),
            }
        }
        Method::DELETE => {
            side.tags.clear();
            let _ = write_sidecar(state, bucket, key, &side).await;
            StatusCode::NO_CONTENT.into_response()
        }
        _ => s3_error(
            StatusCode::METHOD_NOT_ALLOWED,
            "MethodNotAllowed",
            "Unsupported tagging operation",
        ),
    }
}

async fn multipart_start(state: &AppState, bucket: &str, key: &str) -> Response {
    if existing_bucket_path(state, bucket).await.is_none()
        || safe_object_path(&state.root, bucket, key).is_none()
    {
        return s3_error(
            StatusCode::NOT_FOUND,
            "NoSuchBucket",
            "Create the bucket first",
        );
    };
    let id = uuid::Uuid::new_v4().to_string();
    let Some(uploads) = uploads_dir(state, true).await else {
        return s3_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "InternalError",
            "Unsafe upload directory",
        );
    };
    let dir = uploads.join(&id);
    if let Err(e) = fs::create_dir(&dir).await {
        return io_error(e);
    };
    let _ = fs::write(
        dir.join("target.json"),
        serde_json::to_vec(&(bucket, key)).unwrap(),
    )
    .await;
    xml_response(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><InitiateMultipartUploadResult><Bucket>{}</Bucket><Key>{}</Key><UploadId>{id}</UploadId></InitiateMultipartUploadResult>",
        xml(bucket),
        xml(key)
    ))
}

async fn multipart_request(
    state: &AppState,
    method: Method,
    bucket: &str,
    key: &str,
    id: &str,
    part: Option<&String>,
    body: Body,
) -> Response {
    if !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        return s3_error(
            StatusCode::BAD_REQUEST,
            "InvalidRequest",
            "Invalid upload ID",
        );
    };
    let Some(uploads) = uploads_dir(state, false).await else {
        return s3_error(
            StatusCode::NOT_FOUND,
            "NoSuchUpload",
            "Multipart upload does not exist",
        );
    };
    let dir = uploads.join(id);
    let valid_upload_dir = fs::symlink_metadata(&dir)
        .await
        .ok()
        .is_some_and(|m| m.file_type().is_dir() && !m.file_type().is_symlink())
        && canonically_contained(&state.root, &dir).is_some();
    if !valid_upload_dir {
        return s3_error(
            StatusCode::NOT_FOUND,
            "NoSuchUpload",
            "Multipart upload does not exist",
        );
    }
    if method == Method::PUT {
        let n = match part.and_then(|v| v.parse::<u16>().ok()).filter(|n| *n > 0) {
            Some(n) => n,
            None => {
                return s3_error(
                    StatusCode::BAD_REQUEST,
                    "InvalidPart",
                    "A positive partNumber is required",
                );
            }
        };
        let bytes = axum::body::to_bytes(body, usize::MAX)
            .await
            .unwrap_or_default();
        if let Err(e) = fs::write(dir.join(format!("part-{n:05}")), &bytes).await {
            return io_error(e);
        };
        let etag = format!("{:x}", md5::compute(&bytes));
        let mut r = StatusCode::OK.into_response();
        r.headers_mut().insert(
            header::ETAG,
            HeaderValue::from_str(&format!("\"{etag}\"")).unwrap(),
        );
        return r;
    }
    if method == Method::DELETE {
        let _ = fs::remove_dir_all(dir).await;
        return StatusCode::NO_CONTENT.into_response();
    }
    if method != Method::POST {
        return s3_error(
            StatusCode::METHOD_NOT_ALLOWED,
            "MethodNotAllowed",
            "Unsupported multipart operation",
        );
    }
    let path = match object_path_for_write(state, bucket, key).await {
        Ok(path) => path,
        Err(ObjectWritePathError::KeyPathConflict) => {
            return s3_error(
                StatusCode::CONFLICT,
                "KeyPathConflict",
                "An object file already occupies a parent directory for this key",
            );
        }
        Err(ObjectWritePathError::Unsafe) => {
            return s3_error(
                StatusCode::BAD_REQUEST,
                "InvalidObjectName",
                "Unsafe object path",
            );
        }
    };
    let mut out = match fs::File::create(&path).await {
        Ok(f) => f,
        Err(e) => return io_error(e),
    };
    let mut parts: Vec<_> = WalkDir::new(&dir)
        .min_depth(1)
        .max_depth(1)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_name().to_string_lossy().starts_with("part-"))
        .map(|e| e.path().to_path_buf())
        .collect();
    parts.sort();
    for p in parts {
        match fs::read(p).await {
            Ok(bytes) => {
                if let Err(e) = out.write_all(&bytes).await {
                    return io_error(e);
                }
            }
            Err(e) => return io_error(e),
        }
    }
    let _ = out.flush().await;
    drop(out);
    let bytes = fs::read(&path).await.unwrap_or_default();
    let etag = format!("{:x}", md5::compute(&bytes));
    let _ = fs::remove_dir_all(dir).await;
    notify(
        state,
        "s3:ObjectCreated:CompleteMultipartUpload",
        bucket,
        key,
        bytes.len() as u64,
        &etag,
    );
    xml_response(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><CompleteMultipartUploadResult><Location>/{}/{}</Location><Bucket>{}</Bucket><Key>{}</Key><ETag>&quot;{}&quot;</ETag></CompleteMultipartUploadResult>",
        xml(bucket),
        xml(key),
        xml(bucket),
        xml(key),
        etag
    ))
}

async fn uploads_dir(state: &AppState, create: bool) -> Option<PathBuf> {
    let mut current = state.root.join(".s3dir");
    for name in [".s3dir", "uploads"] {
        if name == "uploads" {
            current = current.join(name);
        }
        match fs::symlink_metadata(&current).await {
            Ok(metadata) if metadata.file_type().is_dir() && !metadata.file_type().is_symlink() => {
            }
            Ok(_) => return None,
            Err(e) if create && e.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&current).await.ok()?;
            }
            Err(_) => return None,
        }
        current = canonically_contained(&state.root, &current)?;
    }
    Some(current)
}

async fn api_handle(
    state: &AppState,
    method: Method,
    path: &str,
    query: Option<&str>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let tail = path.trim_start_matches("/_s3dir/api").trim_matches('/');
    let seg: Vec<_> = tail.split('/').filter(|v| !v.is_empty()).collect();
    if seg.is_empty() && method == Method::GET {
        return json_buckets(state);
    }
    if seg.first() == Some(&"buckets") {
        if seg.len() == 1 && method == Method::POST {
            let bytes = axum::body::to_bytes(body, 65536).await.unwrap_or_default();
            let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or_default();
            let name = value["name"].as_str().unwrap_or("");
            if !valid_bucket(name) {
                return json_error(
                    StatusCode::BAD_REQUEST,
                    "Use 3–63 lowercase letters, numbers, dots, or dashes.",
                );
            };
            return match fs::create_dir_all(state.root.join(name)).await {
                Ok(_) => (
                    StatusCode::CREATED,
                    [(header::CONTENT_TYPE, "application/json")],
                    format!("{{\"name\":{}}}", serde_json::to_string(name).unwrap()),
                )
                    .into_response(),
                Err(e) => io_error(e),
            };
        }
        if seg.len() >= 2 {
            let bucket = seg[1];
            if !valid_bucket(bucket) {
                return json_error(
                    StatusCode::BAD_REQUEST,
                    "Use 3–63 lowercase letters, numbers, dots, or dashes.",
                );
            }
            if seg.len() == 2 && method == Method::GET {
                return json_objects(state, bucket, query);
            };
            if seg.len() == 2 && method == Method::DELETE {
                return bucket_request(state, method, bucket, &HashMap::new()).await;
            };
            if seg.len() >= 4 && seg[2] == "objects" {
                let key = match URL_SAFE_NO_PAD
                    .decode(seg[3])
                    .ok()
                    .and_then(|v| String::from_utf8(v).ok())
                {
                    Some(v) => v,
                    None => return json_error(StatusCode::BAD_REQUEST, "Invalid object key"),
                };
                let obj = match safe_object_path(&state.root, bucket, &key) {
                    Some(v) => v,
                    None => return json_error(StatusCode::BAD_REQUEST, "Unsafe object key"),
                };
                return match method {
                    Method::GET => get_object(state, bucket, &key, obj, headers, false).await,
                    Method::PUT => put_object(state, bucket, &key, obj, headers, body).await,
                    Method::DELETE => delete_object(state, bucket, &key, obj).await,
                    _ => json_error(StatusCode::METHOD_NOT_ALLOWED, "Unsupported action"),
                };
            }
        }
    }
    json_error(StatusCode::NOT_FOUND, "Console API route not found")
}

fn json_buckets(state: &AppState) -> Response {
    let mut buckets = vec![];
    if let Ok(entries) = std::fs::read_dir(&*state.root) {
        for e in entries.flatten().filter(|e| {
            let name = e.file_name();
            valid_bucket(&name.to_string_lossy())
                && e.file_type()
                    .map(|t| t.is_dir() && !t.is_symlink())
                    .unwrap_or(false)
                && canonically_contained(&state.root, &e.path())
                    .is_some_and(|p| p.parent() == Some(state.root.as_ref()))
        }) {
            let objects = collect_objects(&e.path());
            buckets.push(BucketInfo {
                name: e.file_name().to_string_lossy().to_string(),
                objects: objects.len(),
                bytes: objects.iter().map(|o| o.size).sum(),
            })
        }
    }
    buckets.sort_by(|a, b| a.name.cmp(&b.name));
    json_response(&serde_json::json!({"buckets":buckets}))
}
fn json_objects(state: &AppState, bucket: &str, query: Option<&str>) -> Response {
    let Some(lexical_bucket) = safe_bucket_path(&state.root, bucket) else {
        return json_error(StatusCode::NOT_FOUND, "Bucket not found");
    };
    let Some(bucket_path) = std::fs::symlink_metadata(&lexical_bucket)
        .ok()
        .filter(|m| m.file_type().is_dir() && !m.file_type().is_symlink())
        .and_then(|_| canonically_contained(&state.root, &lexical_bucket))
        .filter(|p| p.parent() == Some(state.root.as_ref()))
    else {
        return json_error(StatusCode::NOT_FOUND, "Bucket not found");
    };
    let prefix = query_params(query).remove("prefix").unwrap_or_default();
    let objects = collect_objects(&bucket_path)
        .into_iter()
        .filter(|o| o.key.starts_with(&prefix))
        .collect::<Vec<_>>();
    json_response(&serde_json::json!({"bucket":bucket,"prefix":prefix,"objects":objects}))
}

async fn sidecar_path(state: &AppState, bucket: &str, key: &str, create: bool) -> Option<PathBuf> {
    let bucket_path = existing_bucket_path(state, bucket).await?;
    let internal = bucket_path.join(".s3dir");
    match fs::symlink_metadata(&internal).await {
        Ok(metadata) if metadata.file_type().is_dir() && !metadata.file_type().is_symlink() => {}
        Ok(_) => return None,
        Err(e) if create && e.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&internal).await.ok()?;
        }
        Err(_) => return None,
    }
    let internal = canonically_contained(&state.root, &internal)?;
    let path = internal.join(format!("{}.json", URL_SAFE_NO_PAD.encode(key.as_bytes())));
    if let Ok(metadata) = fs::symlink_metadata(&path).await
        && (metadata.file_type().is_symlink()
            || canonically_contained(&state.root, &path).is_none())
    {
        return None;
    }
    Some(path)
}
async fn read_sidecar(state: &AppState, bucket: &str, key: &str) -> Option<Sidecar> {
    fs::read(sidecar_path(state, bucket, key, false).await?)
        .await
        .ok()
        .and_then(|v| serde_json::from_slice(&v).ok())
}
async fn write_sidecar(
    state: &AppState,
    bucket: &str,
    key: &str,
    side: &Sidecar,
) -> std::io::Result<()> {
    let p = sidecar_path(state, bucket, key, true)
        .await
        .ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::PermissionDenied, "unsafe sidecar path")
        })?;
    fs::write(p, serde_json::to_vec_pretty(side).unwrap()).await
}
fn notify(state: &AppState, event: &str, bucket: &str, key: &str, size: u64, etag: &str) {
    if let Some(url) = state.events.clone() {
        let client = state.client.clone();
        let record = EventRecord {
            event_name: event.into(),
            event_time: Utc::now().to_rfc3339(),
            s3: EventS3 {
                bucket: EventBucket {
                    name: bucket.into(),
                },
                object: EventObject {
                    key: key.into(),
                    size,
                    etag: etag.into(),
                },
            },
        };
        tokio::spawn(async move {
            if let Err(e) = client
                .post(&url)
                .json(&serde_json::json!({"Records":[record]}))
                .send()
                .await
            {
                eprintln!("event delivery to {url} failed: {e}")
            }
        });
    }
}

pub async fn seed(root: &Path, fixtures: &Path) -> std::io::Result<usize> {
    if !fixtures.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "seed directory does not exist",
        ));
    }
    let mut count = 0;
    for e in WalkDir::new(fixtures)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
    {
        let rel = e.path().strip_prefix(fixtures).unwrap();
        let dest = root.join(rel);
        if !dest.exists() {
            if let Some(p) = dest.parent() {
                fs::create_dir_all(p).await?
            }
            fs::copy(e.path(), dest).await?;
            count += 1
        }
    }
    Ok(count)
}
fn etag_path(path: &Path) -> String {
    std::fs::read(path)
        .map(|v| format!("{:x}", md5::compute(v)))
        .unwrap_or_default()
}
fn parse_range(value: &str, len: usize) -> Option<(usize, usize)> {
    let r = value.strip_prefix("bytes=")?;
    let (a, b) = r.split_once('-')?;
    let start = a.parse().ok()?;
    let end = if b.is_empty() {
        len.checked_sub(1)?
    } else {
        b.parse().ok()?
    };
    if start <= end && end < len {
        Some((start, end))
    } else {
        None
    }
}
fn parse_form(value: &str) -> HashMap<String, String> {
    value
        .split('&')
        .filter_map(|p| p.split_once('='))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}
fn parse_tag_xml(v: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let mut rest = v;
    while let Some(k) = rest.split_once("<Key>") {
        if let Some((key, after)) = k.1.split_once("</Key>")
            && let Some((_, valpart)) = after.split_once("<Value>")
            && let Some((val, next)) = valpart.split_once("</Value>")
        {
            out.insert(key.to_string(), val.to_string());
            rest = next;
            continue;
        }
        break;
    }
    out
}
fn decode_aws_chunked(input: &[u8]) -> Option<Vec<u8>> {
    let mut cursor = 0;
    let mut output = Vec::new();
    while cursor < input.len() {
        let line_end = input[cursor..].windows(2).position(|w| w == b"\r\n")? + cursor;
        let header = std::str::from_utf8(&input[cursor..line_end]).ok()?;
        let length = usize::from_str_radix(header.split(';').next()?, 16).ok()?;
        cursor = line_end + 2;
        if length == 0 {
            return Some(output);
        }
        let end = cursor.checked_add(length)?;
        if end + 2 > input.len() || &input[end..end + 2] != b"\r\n" {
            return None;
        }
        output.extend_from_slice(&input[cursor..end]);
        cursor = end + 2;
    }
    None
}
fn query_params(query: Option<&str>) -> HashMap<String, String> {
    query
        .unwrap_or("")
        .split('&')
        .filter(|s| !s.is_empty())
        .map(|part| {
            let (k, v) = part.split_once('=').unwrap_or((part, ""));
            (
                percent_decode_str(k).decode_utf8_lossy().to_string(),
                percent_decode_str(v).decode_utf8_lossy().to_string(),
            )
        })
        .collect()
}
fn xml(v: &str) -> String {
    v.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
fn xml_response(body: String) -> Response {
    (
        [(header::CONTENT_TYPE, "application/xml; charset=utf-8")],
        body,
    )
        .into_response()
}
fn json_response(v: &serde_json::Value) -> Response {
    (
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        serde_json::to_string(v).unwrap(),
    )
        .into_response()
}
fn json_error(status: StatusCode, message: &str) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "application/json")],
        serde_json::json!({"error":message}).to_string(),
    )
        .into_response()
}
fn s3_error(status: StatusCode, code: &str, message: &str) -> Response {
    (status,[(header::CONTENT_TYPE,"application/xml; charset=utf-8")],format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Error><Code>{}</Code><Message>{}</Message><RequestId>local</RequestId></Error>",xml(code),xml(message))).into_response()
}
fn io_error(e: std::io::Error) -> Response {
    s3_error(
        StatusCode::INTERNAL_SERVER_ERROR,
        "InternalError",
        &format!("Filesystem operation failed: {e}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::to_bytes, http::Request};
    use tower::ServiceExt;
    #[tokio::test]
    async fn documented_put_get_list_flow() {
        let tmp = tempfile::tempdir().unwrap();
        let app = app(tmp.path().into(), vec![], None);
        let r = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri("/assets")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 200);
        let r = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri("/assets/hello.txt")
                    .header("x-amz-meta-owner", "test")
                    .body(Body::from("hello"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 200);
        let r = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/assets/hello.txt")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 200);
        assert_eq!(r.headers()["x-amz-meta-owner"], "test");
        assert_eq!(&to_bytes(r.into_body(), 99).await.unwrap()[..], b"hello");
        let r = app
            .oneshot(
                Request::builder()
                    .uri("/assets?list-type=2")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let b = to_bytes(r.into_body(), 9999).await.unwrap();
        assert!(String::from_utf8_lossy(&b).contains("<Key>hello.txt</Key>"));
    }
    #[tokio::test]
    async fn blocks_traversal_and_nonempty_bucket_delete() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("assets")).await.unwrap();
        fs::write(tmp.path().join("assets/a"), b"x").await.unwrap();
        let app = app(tmp.path().into(), vec![], None);
        let r = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri("/assets/%2e%2e/escape")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 400);
        let r = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/assets")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 409);
    }
    #[tokio::test]
    async fn reports_documented_key_path_conflicts_for_file_directory_pairs() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("assets")).await.unwrap();
        let app = app(tmp.path().into(), vec![], None);

        let put = |key: &str| {
            Request::builder()
                .method("PUT")
                .uri(format!("/assets/{key}"))
                .body(Body::from("object"))
                .unwrap()
        };
        assert_eq!(app.clone().oneshot(put("foo")).await.unwrap().status(), 200);
        let conflict = app.clone().oneshot(put("foo/bar")).await.unwrap();
        assert_eq!(conflict.status(), StatusCode::CONFLICT);
        let body = to_bytes(conflict.into_body(), 4096).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("<Code>KeyPathConflict</Code>"));

        assert_eq!(
            app.clone()
                .oneshot(put("nested/child"))
                .await
                .unwrap()
                .status(),
            200
        );
        let conflict = app.oneshot(put("nested")).await.unwrap();
        assert_eq!(conflict.status(), StatusCode::CONFLICT);
        let body = to_bytes(conflict.into_body(), 4096).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("<Code>KeyPathConflict</Code>"));
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_puts_create_every_object_under_a_new_shared_prefix() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("assets")).await.unwrap();
        let app = app(tmp.path().into(), vec![], None);

        // Five fresh prefixes mirror the verifier's repeated 50-way load
        // check, making this former create-directory race a regression gate.
        for round in 0..5 {
            let prefix = format!("concurrent-{round}");
            let mut writes = tokio::task::JoinSet::new();
            for number in 0..50 {
                let app = app.clone();
                let prefix = prefix.clone();
                writes.spawn(async move {
                    app.oneshot(
                        Request::builder()
                            .method("PUT")
                            .uri(format!("/assets/{prefix}/{number}.txt"))
                            .body(Body::from(number.to_string()))
                            .unwrap(),
                    )
                    .await
                    .unwrap()
                    .status()
                });
            }
            while let Some(result) = writes.join_next().await {
                assert_eq!(result.unwrap(), StatusCode::OK);
            }

            let listed = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/assets?list-type=2&prefix={prefix}/"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(listed.status(), StatusCode::OK);
            let body = String::from_utf8(
                to_bytes(listed.into_body(), 128 * 1024)
                    .await
                    .unwrap()
                    .to_vec(),
            )
            .unwrap();
            for number in 0..50 {
                assert!(
                    body.contains(&format!("<Key>{prefix}/{number}.txt</Key>")),
                    "{prefix}/{number}.txt must be listed"
                );
            }
        }
    }
    #[tokio::test]
    async fn console_api_rejects_traversal_bucket_segments_and_escape_writes() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("data");
        let outside = tmp.path().join("secret-bucket");
        fs::create_dir(&root).await.unwrap();
        fs::create_dir(&outside).await.unwrap();
        fs::write(outside.join("secret.txt"), b"outside-root-secret")
            .await
            .unwrap();
        let app = app(root.clone(), vec![], None);
        let key = URL_SAFE_NO_PAD.encode(b"secret-bucket/secret.txt");
        for bucket in ["..", "%2e%2e", "."] {
            let listing = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/_s3dir/api/buckets/{bucket}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(
                listing.status(),
                400,
                "bucket {bucket} listing must be rejected"
            );
            let uri = format!("/_s3dir/api/buckets/{bucket}/objects/{key}");
            let r = app
                .clone()
                .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(r.status(), 400, "bucket {bucket} must be rejected");
        }
        let r = app
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/_s3dir/api/buckets/../objects/{key}"))
                    .body(Body::from("overwrite attempt"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 400);
        assert_eq!(
            fs::read(outside.join("secret.txt")).await.unwrap(),
            b"outside-root-secret"
        );
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_bucket_and_object_symlinks_outside_the_canonical_root() {
        use std::os::unix::fs::symlink;

        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("data");
        let outside = tmp.path().join("outside");
        fs::create_dir(&root).await.unwrap();
        fs::create_dir(&outside).await.unwrap();
        fs::write(outside.join("secret.txt"), b"outside-root-secret")
            .await
            .unwrap();
        symlink(&outside, root.join("assets")).unwrap();
        let app = app(root.clone(), vec![], None);
        let r = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/assets/secret.txt")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 404);
        fs::remove_file(root.join("assets")).await.unwrap();
        fs::create_dir(root.join("assets")).await.unwrap();
        symlink(&outside, root.join("assets/link")).unwrap();
        let r = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri("/assets/link/escaped.txt")
                    .body(Body::from("must not escape"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 400);
        assert!(!outside.join("escaped.txt").exists());
        let r = app
            .oneshot(
                Request::builder()
                    .uri("/assets/link/secret.txt")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), 404);
    }
    #[tokio::test]
    async fn multipart_assembles_parts() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join("assets")).await.unwrap();
        let app = app(tmp.path().into(), vec![], None);
        let r = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/assets/big.txt?uploads")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body =
            String::from_utf8(to_bytes(r.into_body(), 9999).await.unwrap().to_vec()).unwrap();
        let id = body
            .split("<UploadId>")
            .nth(1)
            .unwrap()
            .split("</UploadId>")
            .next()
            .unwrap();
        for (n, v) in [(1, "hello "), (2, "world")] {
            let uri = format!("/assets/big.txt?uploadId={id}&partNumber={n}");
            assert_eq!(
                app.clone()
                    .oneshot(
                        Request::builder()
                            .method("PUT")
                            .uri(uri)
                            .body(Body::from(v))
                            .unwrap()
                    )
                    .await
                    .unwrap()
                    .status(),
                200
            )
        }
        let uri = format!("/assets/big.txt?uploadId={id}");
        assert_eq!(
            app.clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(uri)
                        .body(Body::empty())
                        .unwrap()
                )
                .await
                .unwrap()
                .status(),
            200
        );
        assert_eq!(
            fs::read(tmp.path().join("assets/big.txt")).await.unwrap(),
            b"hello world"
        );
    }

    #[test]
    fn decodes_sigv4_streaming_payloads() {
        let body = b"5;chunk-signature=abc\r\nhello\r\n6;chunk-signature=def\r\n world\r\n0;chunk-signature=end\r\n\r\n";
        assert_eq!(decode_aws_chunked(body).unwrap(), b"hello world");
        assert!(decode_aws_chunked(b"wrong\r\n").is_none());
    }
}
