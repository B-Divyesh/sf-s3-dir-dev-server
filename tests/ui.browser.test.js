import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';

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
  const directory = mkdtempSync(join(tmpdir(), 's3dir-browser-'));
  const child = spawn('cargo', ['run', '--quiet', '--', 'serve', directory, '--port', '0', '--json'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
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
}

function stopServer(child) {
  if (process.platform === 'win32') {
    child.kill('SIGTERM');
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function seedPopulatedConsole(endpoint) {
  const bucket = await fetch(`${endpoint}/_s3dir/api/buckets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'qa-assets' }),
  });
  assert.equal(bucket.status, 201);

  const key = Buffer.from('note.txt').toString('base64url');
  const object = await fetch(`${endpoint}/_s3dir/api/buckets/qa-assets/objects/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: 'local console fixture',
  });
  assert.equal(object.status, 200);
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

test('Populated /ui hides every inactive state panel on desktop and 390px mobile', async (t) => {
  const { child, endpoint } = await startServer();
  t.after(() => stopServer(child));
  await seedPopulatedConsole(endpoint);
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
    await page.locator('#object-rows tr').waitFor();
    assert.equal(await page.locator('#table-wrap').isVisible(), true, `${name}: object table is visible`);

    const inactivePanels = await page.locator('#loading, #error, #object-empty').evaluateAll((panels) =>
      panels.map((panel) => ({
        id: panel.id,
        hidden: panel.hidden,
        display: getComputedStyle(panel).display,
        visible: !!(panel.offsetWidth || panel.offsetHeight || panel.getClientRects().length),
      })),
    );
    assert.deepEqual(inactivePanels, [
      { id: 'loading', hidden: true, display: 'none', visible: false },
      { id: 'error', hidden: true, display: 'none', visible: false },
      { id: 'object-empty', hidden: true, display: 'none', visible: false },
    ], `${name}: populated table has no loading, error, or empty panel beside it`);
    assert.deepEqual(errors, [], `${name}: no browser console or page errors`);
    await page.close();
  }
});
