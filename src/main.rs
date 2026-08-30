use clap::{Parser, Subcommand};
use std::{net::IpAddr, path::PathBuf};

#[derive(Parser)]
#[command(
    name = "s3dir",
    version,
    about = "Development-only S3 server backed by ordinary files",
    long_about = "Maps S3 buckets and keys onto a directory, with an embedded console at /ui. Accepts signed and presigned requests without authenticating them. Not for production."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serve a directory as an S3-compatible endpoint
    Serve {
        /// Directory containing bucket folders
        #[arg(default_value = "./data")]
        directory: PathBuf,
        /// Address to bind (use 0.0.0.0 in containers)
        #[arg(long, default_value = "127.0.0.1")]
        host: IpAddr,
        /// TCP port
        #[arg(long, default_value_t = 9000)]
        port: u16,
        /// Copy missing fixtures into the data directory before serving
        #[arg(long)]
        seed: Option<PathBuf>,
        /// POST S3-style object events to this URL
        #[arg(long)]
        events: Option<String>,
        /// Allowed browser origin; repeat for several, or use *
        #[arg(long,action=clap::ArgAction::Append)]
        cors: Vec<String>,
        /// Print one JSON startup record for scripts
        #[arg(long)]
        json: bool,
        /// Requests allowed from one client during each 60-second window
        #[arg(long, default_value_t = 300)]
        request_limit: u32,
    },
    /// Start an isolated server seeded with bundled sample objects
    Demo {
        /// Address to bind (use 0.0.0.0 in containers)
        #[arg(long, default_value = "127.0.0.1")]
        host: IpAddr,
        /// TCP port
        #[arg(long, default_value_t = 9000)]
        port: u16,
        /// Allowed browser origin; repeat for several, or use *
        #[arg(long, action = clap::ArgAction::Append)]
        cors: Vec<String>,
        /// Print one JSON startup record for scripts
        #[arg(long)]
        json: bool,
        /// Requests allowed from one client during each 60-second window
        #[arg(long, default_value_t = 300)]
        request_limit: u32,
    },
}

struct ServeOptions {
    directory: PathBuf,
    host: IpAddr,
    port: u16,
    seed_dir: Option<PathBuf>,
    events: Option<String>,
    cors: Vec<String>,
    json: bool,
    request_limit: u32,
    demo: bool,
    preseeded: usize,
}

#[tokio::main]
async fn main() {
    let Cli { command } = Cli::parse();
    let result = match command {
        Command::Serve {
            directory,
            host,
            port,
            seed,
            events,
            cors,
            json,
            request_limit,
        } => {
            serve(ServeOptions {
                directory,
                host,
                port,
                seed_dir: seed,
                events,
                cors,
                json,
                request_limit,
                demo: false,
                preseeded: 0,
            })
            .await
        }
        Command::Demo {
            host,
            port,
            cors,
            json,
            request_limit,
        } => demo(host, port, cors, json, request_limit).await,
    };
    if let Err(e) = result {
        eprintln!("s3dir: {e}");
        std::process::exit(1);
    }
}

async fn serve(options: ServeOptions) -> Result<(), Box<dyn std::error::Error>> {
    let ServeOptions {
        directory,
        host,
        port,
        seed_dir,
        events,
        cors,
        json,
        request_limit,
        demo,
        preseeded,
    } = options;
    let request_limit = request_limit.max(1);
    tokio::fs::create_dir_all(&directory).await?;
    let seeded = if let Some(path) = seed_dir {
        s3_dir_dev_server::seed(&directory, &path).await?
    } else {
        preseeded
    };
    let address = (host, port);
    let listener = tokio::net::TcpListener::bind(address).await?;
    let actual = listener.local_addr()?;
    if json {
        println!(
            "{}",
            serde_json::json!({"status":"ready","endpoint":format!("http://{actual}"),"ui":format!("http://{actual}/ui"),"directory":directory,"seeded":seeded,"demo":demo,"request_limit":request_limit})
        );
    } else {
        println!(
            "s3dir ready  http://{actual}\nconsole      http://{actual}/ui\ndirectory    {}{}{}\nallowance    {request_limit} requests per client / 60 seconds",
            directory.display(),
            if seeded > 0 {
                format!("\nseeded       {seeded} files")
            } else {
                String::new()
            },
            if demo {
                "\nmode         demo — sample data, nothing is saved to your project"
            } else {
                ""
            }
        );
    }
    axum::serve(
        listener,
        s3_dir_dev_server::app_with_request_limit(directory, cors, events, request_limit)
            .into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .with_graceful_shutdown(wait_for_shutdown())
    .await?;
    Ok(())
}

async fn wait_for_shutdown() {
    let _ = tokio::signal::ctrl_c().await;
}

async fn demo(
    host: IpAddr,
    port: u16,
    cors: Vec<String>,
    json: bool,
    request_limit: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    let directory = std::env::temp_dir().join(format!("s3dir-demo-{}", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(&directory).await?;
    let seeded = s3_dir_dev_server::write_demo_samples(&directory).await?;
    if !json {
        println!(
            "demo files   {}\nreset demo  stop this process; its isolated directory can be removed",
            directory.display()
        );
    }
    let cleanup_directory = directory.clone();
    let result = serve(ServeOptions {
        directory,
        host,
        port,
        seed_dir: None,
        events: None,
        cors,
        json,
        request_limit,
        demo: seeded > 0,
        preseeded: seeded,
    })
    .await;
    if result.is_ok() {
        let _ = tokio::fs::remove_dir_all(cleanup_directory).await;
    }
    result
}
