import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, normalize, extname } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';
import axe from 'axe-core';

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

function stop(child) {
  if (process.platform === 'win32') child.kill('SIGTERM');
  else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

async function startS3(args) {
  const child = spawn('cargo', ['run', '--quiet', '--', ...args], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`s3dir did not start: ${errors}`)), 30_000);
    const receive = () => {
      const line = output.split('\n').find((value) => value.includes('"status":"ready"'));
      if (line) { clearTimeout(timeout); resolve(JSON.parse(line)); }
    };
    child.stdout.on('data', receive);
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`s3dir exited (${code}): ${errors}`)); });
  });
  return { child, ...ready };
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

test('@claim:demo-cli starts an isolated bundled sample', async (t) => {
  const server = await startS3(['demo', '--port', '0', '--json']);
  t.after(() => stop(server.child));
  assert.equal(server.demo, true);
  assert.equal(server.seeded, 3);
  assert.match(server.directory, /s3dir-demo-/);
  assert.equal((await fetch(`${server.endpoint}/health`)).status, 200);
  assert.match(await readFile(join(server.directory, 'assets/welcome.txt'), 'utf8'), /s3dir sample bucket/);
  assert.ok(existsSync(join(server.directory, 'fixtures/local-stack.json')));
});

test('@claim:directory-mapping stores objects as ordinary files', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  assert.equal((await fetch(`${server.endpoint}/assets`, { method: 'PUT' })).status, 200);
  assert.equal((await fetch(`${server.endpoint}/assets/notes/hello.txt`, { method: 'PUT', body: 'mapped bytes' })).status, 200);
  assert.equal(await readFile(join(server.directory, 'assets/notes/hello.txt'), 'utf8'), 'mapped bytes');
});

test('@claim:api-workflow completes multipart, range, tags, and health', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  const endpoint = server.endpoint;
  assert.equal((await fetch(`${endpoint}/assets`, { method: 'PUT' })).status, 200);
  const object = await fetch(`${endpoint}/assets/hello.txt`, { method: 'PUT', headers: { 'x-amz-tagging': 'label=hello%20world', 'x-amz-meta-owner': 'qa' }, body: 'hello world' });
  assert.equal(object.status, 200);
  assert.equal((await fetch(`${endpoint}/assets/hello.txt`, { method: 'HEAD' })).headers.get('x-amz-meta-owner'), 'qa');
  assert.match(await (await fetch(`${endpoint}/assets?list-type=2`)).text(), /<Key>hello\.txt<\/Key>/);
  const range = await fetch(`${endpoint}/assets/hello.txt`, { headers: { Range: 'bytes=-5' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), 'world');
  assert.match(await (await fetch(`${endpoint}/assets/hello.txt?tagging`)).text(), /hello world/);
  const started = await (await fetch(`${endpoint}/assets/report.txt?uploads`, { method: 'POST' })).text();
  const id = started.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  assert.ok(id);
  const parts = [];
  for (const [number, body] of [[1, 'one-'], [2, 'two']]) {
    const part = await fetch(`${endpoint}/assets/report.txt?uploadId=${id}&partNumber=${number}`, { method: 'PUT', body });
    parts.push([number, part.headers.get('etag')]);
  }
  const manifest = parts.map(([number, etag]) => `<Part><PartNumber>${number}</PartNumber><ETag>${etag}</ETag></Part>`).join('');
  assert.equal((await fetch(`${endpoint}/assets/report.txt?uploadId=${id}`, { method: 'POST', body: `<CompleteMultipartUpload>${manifest}</CompleteMultipartUpload>` })).status, 200);
  assert.equal(await (await fetch(`${endpoint}/assets/report.txt`)).text(), 'one-two');
  const health = await (await fetch(`${endpoint}/health`)).json();
  assert.equal(health.status, 'ready');
  assert.ok(health.build);
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

test('@claim:browser-console is available from the local endpoint', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${server.endpoint}/ui`, { waitUntil: 'networkidle' });
  await assert.doesNotReject(page.getByRole('heading', { name: 'Buckets' }).waitFor());
  assert.equal(await page.locator('.brand').evaluate((element) => Math.round(element.getBoundingClientRect().height)), 44);
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

test('@claim:filesystem-boundary rejects traversal outside the selected directory', async (t) => {
  const server = await startServer();
  t.after(() => stop(server.child));
  assert.equal((await fetch(`${server.endpoint}/assets`, { method: 'PUT' })).status, 200);
  const escape = await rawRequest(server.endpoint, '/assets/%2e%2e/escape.txt', 'PUT', 'blocked');
  assert.equal(escape.statusCode, 400);
  assert.equal(existsSync(join(server.directory, 'escape.txt')), false);
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
  const directory = mkdtempSync(join(tmpdir(), 's3dir-events-'));
  const server = await startS3(['serve', directory, '--port', '0', '--json', '--events', endpoint]);
  t.after(() => stop(server.child));
  assert.equal((await fetch(`${server.endpoint}/assets`, { method: 'PUT' })).status, 200);
  assert.equal((await fetch(`${server.endpoint}/assets/private.txt`, { method: 'PUT', body: 'local' })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(events.length, 1);
  assert.match(events[0], /s3:ObjectCreated:Put/);
});

test('@claim:compose-bind-mount drops privileges only after making /data writable', async () => {
  const [dockerfile, entrypoint] = await Promise.all([readFile('Dockerfile', 'utf8'), readFile('docker-entrypoint.sh', 'utf8')]);
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/docker-entrypoint\.sh", "s3dir"\]/);
  assert.match(entrypoint, /chown s3dir:s3dir \/data/);
  assert.match(entrypoint, /exec su-exec s3dir "\$@"/);
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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
