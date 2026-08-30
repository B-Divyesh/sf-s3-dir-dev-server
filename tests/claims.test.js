import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, normalize, extname } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import axe from 'axe-core';
import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const execFileAsync = promisify(execFile);
const binary = join(process.cwd(), 'target', 'debug', process.platform === 'win32' ? 's3dir.exe' : 's3dir');
let debugBinaryBuild;

function chromiumExecutable() {
  for (const candidate of [process.env.CHROMIUM_PATH, process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  const root = '/opt/pw-browsers';
  if (existsSync(root)) {
    const install = readdirSync(root).find((name) => name.startsWith('chromium-'));
    const candidate = install && join(root, install, 'chrome-linux64', 'chrome');
    if (candidate && existsSync(candidate)) return candidate;
  }
  return undefined;
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function signalProcess(child, signal) {
  if (hasExited(child)) return;
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function waitForExit(child, timeoutMs = 5_000) {
  if (hasExited(child)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeout;
    const finish = (callback) => {
      clearTimeout(timeout);
      child.removeListener('exit', onExit);
      callback();
    };
    const onExit = () => finish(resolve);
    timeout = setTimeout(() => finish(() => reject(new Error(`s3dir did not exit within ${timeoutMs}ms`))), timeoutMs);
    child.once('exit', onExit);
    if (hasExited(child)) finish(resolve);
  });
}

async function stop(child, signal = 'SIGTERM') {
  if (hasExited(child)) return;
  signalProcess(child, signal);
  try {
    await waitForExit(child);
  } catch (error) {
    signalProcess(child, 'SIGKILL');
    await waitForExit(child);
    throw error;
  }
}

async function interruptDemo(child) {
  await stop(child, 'SIGINT');
}

function sdkClient(endpoint) {
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
}

async function buildDebugBinary() {
  if (!debugBinaryBuild) {
    debugBinaryBuild = new Promise((resolve, reject) => {
      const child = spawn('cargo', ['build', '--quiet', '--locked'], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'] });
      let errors = '';
      child.stderr.on('data', (chunk) => { errors += chunk; });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code === 0 && existsSync(binary)) resolve();
        else reject(new Error(`cargo build must produce the direct CLI test binary: ${errors}`));
      });
    }).catch((error) => {
      debugBinaryBuild = undefined;
      throw error;
    });
  }
  await debugBinaryBuild;
}

async function startS3(args) {
  // Compilation belongs outside the readiness window. A clean clone can take
  // longer than a server startup, but it must not make the CLI demo flaky.
  await buildDebugBinary();
  const child = spawn(binary, args, {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  try {
    const ready = await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.stdout.removeListener('data', receive);
        child.removeListener('exit', onExit);
        child.removeListener('error', onError);
        callback(value);
      };
    const receive = () => {
      const line = output.split('\n').find((value) => value.includes('"status":"ready"'));
      if (!line) return;
      try { finish(resolve, JSON.parse(line)); } catch (error) { finish(reject, error); }
    };
      const onExit = (code) => finish(reject, new Error(`s3dir exited (${code}): ${errors}`));
      const onError = (error) => finish(reject, error);
      const timeout = setTimeout(() => finish(reject, new Error(`s3dir did not start: ${errors}`)), 30_000);
      child.stdout.on('data', receive);
      child.once('exit', onExit);
      child.once('error', onError);
      receive();
    });
    return { child, ...ready };
  } catch (error) {
    await stop(child);
    throw error;
  }
}

async function startServer() {
  const directory = mkdtempSync(join(tmpdir(), 's3dir-claim-'));
  return { directory, ...(await startS3(['serve', directory, '--port', '0', '--json'])) };
}

function contentType(path) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' })[extname(path)] || 'application/octet-stream';
}

async function startStaticSite() {
  const root = join(process.cwd(), 'dist/site');
  assert.ok(existsSync(root), 'npm run build:site must run before browser claim tests');
  const server = createServer(async (request, response) => {
    const rawPath = new URL(request.url, 'http://localhost').pathname;
    const requested = rawPath.endsWith('/') ? `${rawPath}index.html` : rawPath;
    const file = normalize(join(root, requested));
    const allowed = file === root || file.startsWith(`${root}/`);
    try {
      if (!allowed) throw new Error('outside root');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': contentType(file) });
      response.end(body);
    } catch {
      const body = readFileSync(join(root, '404.html'));
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end(body);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function rawRequest(endpoint, path, method = 'GET', body = '') {
  const target = new URL(endpoint);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path, method }, (response) => {
      response.resume();
      response.on('end', () => resolve(response));
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function assertNoSeriousAxe(page, label) {
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
  const violations = results.violations
    .filter((violation) => ['serious', 'critical'].includes(violation.impact))
    .map((violation) => `${violation.id}: ${violation.help}`);
  assert.deepEqual(violations, [], `${label} must have no serious or critical axe violations`);
}

async function dockerAvailable() {
  try {
    await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function runDocker(args, timeout = 120_000) {
  return execFileAsync('docker', args, { cwd: process.cwd(), timeout, maxBuffer: 1024 * 1024 });
}

async function unusedLocalPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(endpoint, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let latestError = 'server did not accept connections';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/health`);
      if (response.ok) return response;
      latestError = `health returned ${response.status}`;
    } catch (error) {
      latestError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`container did not become ready: ${latestError}`);
}

test('@claim:demo-cli starts an isolated bundled sample from the CLI and ?demo=1', async (t) => {
  // This must finish before `startS3` begins its 30-second readiness clock.
  await buildDebugBinary();
  const server = await startS3(['demo', '--port', '0', '--json']);
  t.after(() => interruptDemo(server.child));
  assert.equal(server.demo, true);
  assert.equal(server.seeded, 3);
  assert.match(server.directory, /s3dir-demo-/);
  assert.equal((await fetch(`${server.endpoint}/health`)).status, 200);
  assert.match(await readFile(join(server.directory, 'assets/welcome.txt'), 'utf8'), /s3dir sample bucket/);
  assert.ok(existsSync(join(server.directory, 'fixtures/local-stack.json')));

  const site = await startStaticSite();
  t.after(site.close);
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(`${site.origin}/?demo=1`, { waitUntil: 'networkidle' });
  assert.match(page.url(), /\/demo\/\?demo=1$/);
  await assert.doesNotReject(page.getByRole('heading', { name: 'Try local S3 with sample files.' }).waitFor());
  assert.equal(await page.evaluate(() => sessionStorage.getItem('demo:s3dir:active')), '1');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  assert.equal(await page.evaluate(() => Object.keys(sessionStorage).every((key) => key.startsWith('demo:s3dir:'))), true);
});

test('@claim:demo-cleanup removes the isolated sample directory after Ctrl-C', async () => {
  const server = await startS3(['demo', '--port', '0', '--json']);
  assert.ok(existsSync(server.directory));
  await interruptDemo(server.child);
  assert.equal(existsSync(server.directory), false);
});

test('@claim:directory-mapping stores objects as ordinary files', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  assert.equal((await fetch(`${server.endpoint}/assets`, { method: 'PUT' })).status, 200);
  assert.equal((await fetch(`${server.endpoint}/assets/notes/hello.txt`, { method: 'PUT', body: 'mapped bytes' })).status, 200);
  assert.equal(await readFile(join(server.directory, 'assets/notes/hello.txt'), 'utf8'), 'mapped bytes');
});

test('@claim:api-workflow completes the documented workflow through the current AWS SDK', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  const s3 = sdkClient(server.endpoint);
  await s3.send(new CreateBucketCommand({ Bucket: 'assets' }));
  await s3.send(new PutObjectCommand({
    Bucket: 'assets', Key: 'hello.txt', Body: 'hello world', Tagging: 'label=hello%20world', Metadata: { owner: 'qa' },
  }));
  const head = await s3.send(new HeadObjectCommand({ Bucket: 'assets', Key: 'hello.txt' }));
  assert.equal(head.Metadata?.owner, 'qa');
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: 'assets' }));
  assert.deepEqual(listed.Contents?.map((object) => object.Key), ['hello.txt']);
  const ranged = await s3.send(new GetObjectCommand({ Bucket: 'assets', Key: 'hello.txt', Range: 'bytes=-5' }));
  assert.equal(await ranged.Body?.transformToString(), 'world');
  const tags = await s3.send(new GetObjectTaggingCommand({ Bucket: 'assets', Key: 'hello.txt' }));
  assert.deepEqual(tags.TagSet, [{ Key: 'label', Value: 'hello world' }]);
  assert.ok(readdirSync(join(server.directory, 'assets', '.s3dir')).some((name) => name.endsWith('.json')));
  const started = await s3.send(new CreateMultipartUploadCommand({ Bucket: 'assets', Key: 'report.txt' }));
  assert.ok(started.UploadId);
  const parts = [];
  for (const [PartNumber, Body] of [[1, 'one-'], [2, 'two']]) {
    const part = await s3.send(new UploadPartCommand({ Bucket: 'assets', Key: 'report.txt', UploadId: started.UploadId, PartNumber, Body }));
    assert.ok(part.ETag);
    parts.push({ ETag: part.ETag, PartNumber });
  }
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: 'assets', Key: 'report.txt', UploadId: started.UploadId, MultipartUpload: { Parts: parts },
  }));
  const completed = await s3.send(new GetObjectCommand({ Bucket: 'assets', Key: 'report.txt' }));
  assert.equal(await completed.Body?.transformToString(), 'one-two');
  const health = await (await fetch(`${server.endpoint}/health`)).json();
  assert.equal(health.status, 'ready');
  assert.ok(health.build);
});

test('@claim:presigned-requests accepts a current AWS SDK presigned URL', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  const s3 = sdkClient(server.endpoint);
  await s3.send(new CreateBucketCommand({ Bucket: 'assets' }));
  await s3.send(new PutObjectCommand({ Bucket: 'assets', Key: 'presigned.txt', Body: 'presigned bytes' }));
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: 'assets', Key: 'presigned.txt' }));
  assert.match(url, /X-Amz-Signature=/i);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'presigned bytes');
});

test('@claim:cors-control returns an allowed origin and omits an unallowed one', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 's3dir-cors-'));
  const server = await startS3(['serve', directory, '--port', '0', '--json', '--cors', 'http://allowed.test']);
  t.after(() => stop(server.child));
  const allowed = await fetch(`${server.endpoint}/`, { headers: { Origin: 'http://allowed.test' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://allowed.test');
  const denied = await fetch(`${server.endpoint}/`, { headers: { Origin: 'http://denied.test' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('@claim:fixture-seeding copies missing fixture files without replacing existing data', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 's3dir-seed-data-'));
  const fixtures = mkdtempSync(join(tmpdir(), 's3dir-seed-source-'));
  mkdirSync(join(directory, 'assets'), { recursive: true });
  writeFileSync(join(directory, 'assets', 'existing.txt'), 'keep this');
  mkdirSync(join(fixtures, 'assets'), { recursive: true });
  writeFileSync(join(fixtures, 'assets', 'existing.txt'), 'do not replace');
  writeFileSync(join(fixtures, 'assets', 'new.txt'), 'copy this');
  const server = await startS3(['serve', directory, '--seed', fixtures, '--port', '0', '--json']);
  t.after(async () => { await stop(server.child); rmSync(fixtures, { recursive: true, force: true }); });
  assert.equal(server.seeded, 1);
  assert.equal(await readFile(join(directory, 'assets', 'existing.txt'), 'utf8'), 'keep this');
  assert.equal(await readFile(join(directory, 'assets', 'new.txt'), 'utf8'), 'copy this');
});

test('@claim:request-allowance returns 429 and Retry-After after 300 requests', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  for (let request = 0; request < 300; request += 1) {
    assert.equal((await fetch(`${server.endpoint}/`)).status, 200);
  }
  const limited = await fetch(`${server.endpoint}/`);
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get('retry-after') || '', /^\d+$/);
});

test('@claim:browser-console browses, uploads, edits, and removes local data with actionable errors', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const origins = new Set();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto(`${server.endpoint}/ui`, { waitUntil: 'networkidle' });
  await assert.doesNotReject(page.getByRole('heading', { name: 'Buckets' }).waitFor());
  assert.equal(await page.locator('.brand').evaluate((element) => Math.round(element.getBoundingClientRect().height)), 44);
  await page.getByRole('button', { name: 'Create bucket' }).click();
  await page.locator('#bucket-name').fill('console-data');
  await page.locator('#bucket-dialog').getByRole('button', { name: 'Create bucket' }).click();
  // Creating a bucket selects it asynchronously. Waiting for that observable
  // state prevents a test-only hidden file input from racing ahead of the UI.
  await page.getByRole('heading', { name: 'console-data' }).waitFor();
  await page.setInputFiles('#upload', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('first draft') });
  await page.getByRole('button', { name: 'Inspect and edit note.txt' }).click();
  await page.locator('#editor-content').fill('edited from console');
  await page.getByRole('button', { name: 'Save to disk' }).click();
  await assert.doesNotReject(page.getByText('Saved note.txt').waitFor());
  assert.equal(await (await fetch(`${server.endpoint}/console-data/note.txt`)).text(), 'edited from console');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete bucket' }).click();
  await assert.doesNotReject(page.getByText('Remove all objects before deleting the bucket').waitFor());
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete note.txt' }).click();
  await page.getByText('This bucket is an empty room').waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete bucket' }).click();
  await page.getByText('No buckets yet').waitFor();
  assert.deepEqual([...origins], [server.endpoint]);
});

test('@claim:no-telemetry makes only same-origin browser requests', async (t) => {
  const site = await startStaticSite();
  t.after(site.close);
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const origins = new Set();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto(site.origin, { waitUntil: 'networkidle' });
  assert.deepEqual([...origins], [site.origin]);
});

test('@claim:offline-docs reload after the first visit', async (t) => {
  const site = await startStaticSite();
  t.after(site.close);
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(`${site.origin}/privacy/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assert.doesNotReject(page.getByRole('heading', { name: 'Privacy for local S3 development.' }).waitFor());
});

test('@claim:filesystem-boundary rejects traversal, internal paths, and symlink escapes', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  assert.equal((await fetch(`${server.endpoint}/assets`, { method: 'PUT' })).status, 200);
  const escape = await rawRequest(server.endpoint, '/assets/%2e%2e/escape.txt', 'PUT', 'blocked');
  assert.equal(escape.statusCode, 400);
  assert.equal(existsSync(join(server.directory, 'escape.txt')), false);
  assert.equal((await fetch(`${server.endpoint}/assets/.s3dir/private.txt`, { method: 'PUT', body: 'blocked' })).status, 400);
  assert.equal(existsSync(join(server.directory, 'assets/.s3dir/private.txt')), false);
  if (process.platform !== 'win32') {
    const outside = mkdtempSync(join(tmpdir(), 's3dir-outside-'));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    symlinkSync(outside, join(server.directory, 'assets', 'escape-link'));
    assert.equal((await fetch(`${server.endpoint}/assets/escape-link/private.txt`, { method: 'PUT', body: 'blocked' })).status, 400);
    assert.equal(existsSync(join(outside, 'private.txt')), false);
  }
});

test('@claim:multipart-rejection rejects incomplete and mismatched completion manifests', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  assert.equal((await fetch(`${server.endpoint}/assets`, { method: 'PUT' })).status, 200);
  const started = await (await fetch(`${server.endpoint}/assets/report.txt?uploads`, { method: 'POST' })).text();
  const uploadId = started.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  assert.ok(uploadId, 'multipart start must return an upload id');
  const incomplete = await fetch(`${server.endpoint}/assets/report.txt?uploadId=${encodeURIComponent(uploadId)}`, {
    method: 'POST', body: '<CompleteMultipartUpload/>',
  });
  assert.equal(incomplete.status, 400);
  assert.match(await incomplete.text(), /MalformedXML/);
  assert.equal((await fetch(`${server.endpoint}/assets/report.txt?partNumber=1&uploadId=${encodeURIComponent(uploadId)}`, { method: 'PUT', body: 'part one' })).status, 200);
  const mismatched = await fetch(`${server.endpoint}/assets/report.txt?uploadId=${encodeURIComponent(uploadId)}`, {
    method: 'POST',
    body: '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>not-the-uploaded-part</ETag></Part></CompleteMultipartUpload>',
  });
  assert.equal(mismatched.status, 400);
  assert.match(await mismatched.text(), /InvalidPart/);
  assert.equal((await fetch(`${server.endpoint}/assets/report.txt`)).status, 404);
});

test('@claim:key-path-conflict returns 409 when a file and directory need the same key path', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  assert.equal((await fetch(`${server.endpoint}/assets`, { method: 'PUT' })).status, 200);
  assert.equal((await fetch(`${server.endpoint}/assets/foo`, { method: 'PUT', body: 'file first' })).status, 200);
  assert.equal((await fetch(`${server.endpoint}/assets/foo/bar`, { method: 'PUT', body: 'must conflict' })).status, 409);
  assert.equal((await fetch(`${server.endpoint}/assets/nested/child`, { method: 'PUT', body: 'directory first' })).status, 200);
  assert.equal((await fetch(`${server.endpoint}/assets/nested`, { method: 'PUT', body: 'must conflict' })).status, 409);
});

test('@claim:privacy-default only emits object events to an explicit webhook URL', async (t) => {
  const events = [];
  const receiver = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => { events.push(body); response.writeHead(204); response.end(); });
  });
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => receiver.close(resolve)));
  const endpoint = `http://127.0.0.1:${receiver.address().port}/events`;
  const localOnly = await startServer();
  t.after(() => stop(localOnly.child));
  assert.equal((await fetch(`${localOnly.endpoint}/assets`, { method: 'PUT' })).status, 200);
  assert.equal((await fetch(`${localOnly.endpoint}/assets/local.txt`, { method: 'PUT', body: 'local' })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(events.length, 0);
  const directory = mkdtempSync(join(tmpdir(), 's3dir-events-'));
  const server = await startS3(['serve', directory, '--port', '0', '--json', '--events', endpoint]);
  t.after(() => stop(server.child));
  assert.equal((await fetch(`${server.endpoint}/assets`, { method: 'PUT' })).status, 200);
  assert.equal((await fetch(`${server.endpoint}/assets/private.txt`, { method: 'PUT', body: 'local' })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(events.length, 1);
  assert.match(events[0], /s3:ObjectCreated:Put/);
});

test('@claim:compose-bind-mount makes a fresh bind mount writable before serving unprivileged', async (t) => {
  if (!(await dockerAvailable())) {
    t.skip('Docker daemon unavailable; run this claim in a Docker-enabled release environment.');
    return;
  }
  const token = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const root = mkdtempSync(join(tmpdir(), 's3dir-compose-'));
  const data = join(root, 'data');
  const image = `s3dir-claim-${token}`;
  const container = `s3dir-claim-${token}`;
  mkdirSync(data);
  // A new host directory is not writable by the image's non-root user until
  // its entrypoint repairs ownership. A successful object write proves the
  // documented fresh-bind-mount behavior rather than a source-file pattern.
  chmodSync(data, 0o755);
  t.after(async () => {
    await runDocker(['rm', '--force', container], 20_000).catch(() => {});
    rmSync(root, { recursive: true, force: true });
  });
  await runDocker(['build', '--tag', image, '.'], 300_000);
  const port = await unusedLocalPort();
  await runDocker([
    'run', '--detach', '--name', container,
    '--publish', `127.0.0.1:${port}:9000`,
    '--volume', `${data}:/data`,
    image,
  ]);
  const endpoint = `http://127.0.0.1:${port}`;
  assert.equal((await waitForHealth(endpoint)).status, 200);
  assert.equal((await fetch(`${endpoint}/assets`, { method: 'PUT' })).status, 200);
  assert.equal((await fetch(`${endpoint}/assets/bind-mount.txt`, { method: 'PUT', body: 'writable' })).status, 200);
  assert.equal(await readFile(join(data, 'assets', 'bind-mount.txt'), 'utf8'), 'writable');
  const { stdout } = await runDocker(['exec', container, 'sh', '-c', "awk '/^Uid:/ { print $2 }' /proc/1/status"]);
  assert.match(stdout.trim(), /^\d+$/);
  assert.notEqual(stdout.trim(), '0', 'the server process must not run as root');
});

test('accessibility: built static routes have no serious or critical axe violations', async (t) => {
  const site = await startStaticSite();
  t.after(site.close);
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  for (const route of ['/', '/demo/', '/privacy/', '/terms/']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${site.origin}${route}`, { waitUntil: 'networkidle' });
    await assertNoSeriousAxe(page, route);
    await page.close();
  }
});

test('accessibility: embedded local console has no serious or critical axe violations', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  // axe injects its audit script inline. Keep the shipped console CSP strict;
  // only this isolated audit context bypasses it so accessibility can inspect
  // the real DOM without weakening the runtime response policy.
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 390, height: 844 } });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(`${server.endpoint}/ui`, { waitUntil: 'networkidle' });
  await assertNoSeriousAxe(page, 'local console');
});

test('browser: static routes work at 390px with keyboard and 44px controls', async (t) => {
  const site = await startStaticSite();
  t.after(site.close);
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  for (const route of ['/', '/demo/', '/privacy/', '/terms/', '/404.html']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${site.origin}${route}`, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${route} has no horizontal overflow`);
    const undersized = await page.locator('a, button').evaluateAll((controls) => controls
      .filter((control) => {
        const style = getComputedStyle(control);
        const box = control.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
      })
      .map((control) => `${control.tagName}:${control.textContent?.trim() || control.getAttribute('aria-label')}`));
    assert.deepEqual(undersized, [], `${route} has only 44px-or-larger visible controls`);
    assert.deepEqual(errors, [], `${route} has no browser errors`);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${site.origin}/demo/`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => location.hash), '#main');
  await page.getByRole('button', { name: 'Reset demo' }).focus();
  await page.keyboard.press('Enter');
  await assert.doesNotReject(page.getByText('Sample reset. Run the command to create a new temporary directory.').waitFor());
});

test('browser: landing to demo and Back move focus to the route heading', async (t) => {
  const site = await startStaticSite();
  t.after(site.close);
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(site.origin, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Try it with sample data' }).click();
  await page.waitForURL(/\/demo\/\?demo=1$/);
  await page.waitForFunction(() => document.activeElement === document.querySelector('main h1'));
  assert.match(await page.locator('.route-status').textContent(), /Demo — s3dir loaded/);
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.activeElement === document.querySelector('main h1'));
  assert.match(await page.locator('.route-status').textContent(), /s3dir — Local S3 from a directory loaded/);
});
