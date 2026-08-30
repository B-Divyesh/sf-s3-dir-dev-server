import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';

const binary = join(process.cwd(), 'target', 'debug', process.platform === 'win32' ? 's3dir.exe' : 's3dir');
let debugBinaryBuild;

function chromiumExecutable() {
  for (const candidate of [
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  ]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  const root = '/opt/pw-browsers';
  if (existsSync(root)) {
    const install = readdirSync(root).find((name) => name.startsWith('chromium-'));
    const candidate = install && join(root, install, 'chrome-linux64', 'chrome');
    if (candidate && existsSync(candidate)) return candidate;
  }
  return undefined; // The normal Playwright cache after `npx playwright install chromium`.
}

async function startServer() {
  await buildDebugBinary();
  const directory = mkdtempSync(join(tmpdir(), 's3dir-browser-'));
  const child = spawn(binary, ['serve', directory, '--port', '0', '--json'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`s3dir did not start: ${errors}`)), 30_000);
      const onData = () => {
        const ready = output.split('\n').find((line) => line.includes('"status":"ready"'));
        if (!ready) return;
        clearTimeout(timeout);
        resolve(JSON.parse(ready).endpoint);
      };
      child.stdout.on('data', onData);
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`s3dir exited before readiness (${code}): ${errors}`));
      });
    });
    return { child, endpoint };
  } catch (error) {
    await stopServer(child);
    throw error;
  }
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
        else reject(new Error(`cargo build must produce the browser test binary: ${errors}`));
      });
    }).catch((error) => {
      debugBinaryBuild = undefined;
      throw error;
    });
  }
  await debugBinaryBuild;
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function signalServer(child, signal) {
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

async function stopServer(child) {
  if (hasExited(child)) return;
  signalServer(child, 'SIGTERM');
  try {
    await waitForExit(child);
  } catch (error) {
    signalServer(child, 'SIGKILL');
    await waitForExit(child);
    throw error;
  }
}

async function createBucket(endpoint, name) {
  const bucket = await fetch(`${endpoint}/_s3dir/api/buckets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  assert.equal(bucket.status, 201);
}

async function seedConsoleStates(endpoint) {
  await createBucket(endpoint, 'qa-empty');
  await createBucket(endpoint, 'qa-assets');

  const key = Buffer.from('note.txt').toString('base64url');
  const object = await fetch(`${endpoint}/_s3dir/api/buckets/qa-assets/objects/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: 'local console fixture',
  });
  assert.equal(object.status, 200);
}

async function stateSnapshot(page) {
  return page.locator('#loading, #error, #object-empty, #table-wrap').evaluateAll((panels) =>
    panels.map((panel) => ({
      id: panel.id,
      hidden: panel.hidden,
      display: getComputedStyle(panel).display,
      visible: !!(panel.offsetWidth || panel.offsetHeight || panel.getClientRects().length),
    })),
  );
}

async function assertOnlyState(page, active, label) {
  const panels = await stateSnapshot(page);
  assert.deepEqual(panels, panels.map((panel) => ({
    ...panel,
    hidden: panel.id !== active,
    display: panel.id === active ? panel.display : 'none',
    visible: panel.id === active,
  })), `${label}: only ${active} participates in layout`);
}

test('Create bucket accepts a valid Chromium bucket name without console errors', async (t) => {
  const { child, endpoint } = await startServer();
  t.after(() => stopServer(child));
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${endpoint}/ui`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create bucket' }).click();
  await page.locator('#bucket-name').fill('qa-bucket');
  const created = page.waitForResponse((response) =>
    response.url().endsWith('/_s3dir/api/buckets')
      && response.request().method() === 'POST',
  );
  await page.locator('#bucket-dialog').getByRole('button', { name: 'Create bucket' }).click();
  assert.equal((await created).status(), 201);
  await assert.doesNotReject(page.getByRole('heading', { name: 'qa-bucket' }).waitFor());
  assert.deepEqual(errors, []);
});

test('Keyboard users can skip to the console and open or dismiss Create bucket', async (t) => {
  const { child, endpoint } = await startServer();
  t.after(() => stopServer(child));
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${endpoint}/ui`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => location.hash), '#workspace');

  const create = page.getByRole('button', { name: 'Create bucket' });
  await create.focus();
  await page.keyboard.press('Enter');
  await page.locator('#bucket-dialog[open]').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'bucket-name');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#bucket-dialog')?.open);
  assert.deepEqual(errors, []);
});

test('Console state panels are mutually exclusive on desktop and 390px mobile', async (t) => {
  const { child, endpoint } = await startServer();
  t.after(() => stopServer(child));
  await seedConsoleStates(endpoint);
  const browser = await chromium.launch({ executablePath: chromiumExecutable() });
  t.after(() => browser.close());

  for (const [name, viewport] of [
    ['desktop', { width: 1366, height: 900 }],
    ['390px mobile', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`${endpoint}/ui`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'qa-empty' }).click();
    await page.locator('#object-empty').waitFor();
    await assertOnlyState(page, 'object-empty', `${name}: empty bucket`);

    let releaseLoadingRequest;
    await page.route('**/_s3dir/api/buckets/qa-assets', async (route) => {
      await new Promise((resolve) => { releaseLoadingRequest = resolve; });
      await route.continue();
    });
    await page.getByRole('button', { name: 'qa-assets' }).click();
    await page.locator('#loading').waitFor();
    await assertOnlyState(page, 'loading', `${name}: object request in flight`);
    releaseLoadingRequest();
    await page.locator('#object-rows tr').waitFor();
    await page.unroute('**/_s3dir/api/buckets/qa-assets');
    await assertOnlyState(page, 'table-wrap', `${name}: populated bucket`);

    await page.route('**/_s3dir/api/buckets/qa-empty', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Planned endpoint failure' }),
    }));
    await page.getByRole('button', { name: 'qa-empty' }).click();
    await page.locator('#error').waitFor();
    await assertOnlyState(page, 'error', `${name}: endpoint failure`);
    await page.unroute('**/_s3dir/api/buckets/qa-empty');
    // The deliberately fulfilled 503 is surfaced by Chromium as a console
    // network error. It proves the endpoint-error panel path; every other
    // console or page error remains a regression.
    assert.deepEqual(
      errors.filter((message) => !message.includes('server responded with a status of 503')),
      [],
      `${name}: no unexpected browser console or page errors`,
    );
    await page.close();
  }
});
