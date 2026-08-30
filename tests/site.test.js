import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('landing has a plain first read, semantic landmarks, and a demo action', async () => {
  const html = await readFile('site/index.html', 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.match(html, /<main id="main">/);
  assert.match(html, /For application developers/);
  assert.match(html, /href="\/\?demo=1">Try it with sample data/);
  assert.match(html, /alt="[^"]+"/);
});

test('demo and legal routes include their required isolated-demo and footer controls', async () => {
  const [demo, privacy, terms] = await Promise.all([
    readFile('site/demo/index.html', 'utf8'),
    readFile('site/privacy/index.html', 'utf8'),
    readFile('site/terms/index.html', 'utf8'),
  ]);
  assert.match(demo, /Demo — sample data, nothing is saved to your project/);
  assert.match(demo, /Reset demo/);
  assert.match(demo, /Start for real/);
  for (const html of [demo, privacy, terms]) {
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert.match(html, /Build 0\.1\.0/);
    assert.match(html, /href="\/privacy\/"/);
    assert.match(html, /href="\/terms\/"/);
  }
});

test('site metadata, discovery files, and designed 404 are present', async () => {
  const [landing, notFound, robots, sitemap, config] = await Promise.all([
    readFile('site/index.html', 'utf8'),
    readFile('site/404.html', 'utf8'),
    readFile('site/public/robots.txt', 'utf8'),
    readFile('site/public/sitemap.xml', 'utf8'),
    readFile('site/public/staticwebapp.config.json', 'utf8'),
  ]);
  assert.match(landing, /rel="canonical"/);
  assert.match(landing, /property="og:image"/);
  assert.match(landing, /name="twitter:card"/);
  assert.match(landing, /apple-touch-icon/);
  assert.match(landing, /social-card\.webp/);
  assert.match(notFound, /That page is not in this directory/);
  assert.match(notFound, /name="description"/);
  assert.match(notFound, /rel="canonical" href="https:\/\/s3-dir-dev-server\.sociobot\.in\/404\.html"/);
  assert.match(notFound, /property="og:image"/);
  assert.match(notFound, /name="twitter:card"/);
  assert.match(notFound, /apple-touch-icon/);
  assert.match(robots, /Sitemap:/);
  assert.match(sitemap, /<loc>https:\/\/s3-dir-dev-server\.sociobot\.in\/demo\/<\/loc>/);
  const swa = JSON.parse(config);
  assert.equal(swa.navigationFallback, undefined);
  assert.equal(swa.responseOverrides['404'].rewrite, '/404.html');
  assert.equal(swa.responseOverrides['404'].statusCode, 404);
});

test('static host rules send security policy and immutable asset caching', async () => {
  const headers = await readFile('site/public/_headers', 'utf8');
  const swa = JSON.parse(await readFile('site/public/staticwebapp.config.json', 'utf8'));
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Permissions-Policy:/);
  assert.match(headers, /\/assets\/\*/);
  assert.match(headers, /max-age=31536000, immutable/);
  assert.match(swa.globalHeaders['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(swa.globalHeaders['X-Frame-Options'], 'DENY');
  assert.ok(swa.routes.some((route) => route.route === '/assets/*' && route.headers['Cache-Control'].includes('immutable')));
});

test('styles honor motion, mobile, and 44px touch-target constraints', async () => {
  const css = await readFile('site/styles.css', 'utf8');
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media\s*\(max-width:\s*800px\)/);
  assert.match(css, /\.logo \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.text-link \{[\s\S]*?min-height: 44px/);
  assert.ok(Buffer.byteLength(css) < 50_000);
});

test('embedded UI has one h1, live feedback, and touch-safe controls', async () => {
  const [html, css] = await Promise.all([readFile('src/ui.html', 'utf8'), readFile('src/ui.css', 'utf8')]);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="offline"/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.brand \{[\s\S]*?min-height: 44px/);
});

test('package and public terms consistently declare the required Apache-2.0 license', async () => {
  const [cargo, license, readme, terms, { stdout }] = await Promise.all([
    readFile('Cargo.toml', 'utf8'), readFile('LICENSE', 'utf8'), readFile('README.md', 'utf8'),
    readFile('site/terms/index.html', 'utf8'), execFileAsync('cargo', ['metadata', '--no-deps', '--format-version', '1']),
  ]);
  const packageMetadata = JSON.parse(stdout).packages.find((pkg) => pkg.name === 's3-dir-dev-server');
  assert.equal(packageMetadata?.license, 'Apache-2.0');
  assert.match(cargo, /license = "Apache-2\.0"/);
  assert.match(cargo, /"\/README\.md"/);
  assert.match(license, /Apache License\n\s+Version 2\.0, January 2004/);
  assert.match(license, /SPDX-License-Identifier: Apache-2\.0/);
  assert.match(readme, /Apache-2\.0\. See \[LICENSE\]/);
  assert.match(terms, /Apache License 2\.0 \(Apache-2\.0\)/);
  assert.doesNotMatch(`${cargo}\n${license}\n${readme}\n${terms}`, /MIT License/);
});

test('service worker versions, clears, and dynamically caches the offline shell', async () => {
  const [sw, register] = await Promise.all([readFile('site/public/sw.js', 'utf8'), readFile('site/sw-register.js', 'utf8')]);
  assert.match(sw, /s3dir-site-v5/);
  assert.match(sw, /keys\.filter\(key=>key!==CACHE\)/);
  assert.match(sw, /cache\.put\(event\.request,response\.clone\(\)\)/);
  assert.match(register, /serviceWorker\.register\('\/sw\.js'\)/);
});

test('each public claim has exactly one tagged sandbox regression', async () => {
  const [manifest, claimsTests] = await Promise.all([
    readFile('.factory/claims.json', 'utf8'), readFile('tests/claims.test.js', 'utf8'),
  ]);
  const claims = JSON.parse(manifest);
  assert.ok(claims.length >= 10);
  for (const claim of claims) {
    const tag = `@claim:${claim.id}`;
    assert.equal(claimsTests.split(tag).length - 1, 1, `${tag} must name exactly one test`);
    assert.match(claim.test, new RegExp(tag));
  }
});

test('all public routes make the heading focusable and include route announcements', async () => {
  const routes = ['site/index.html', 'site/demo/index.html', 'site/privacy/index.html', 'site/terms/index.html', 'site/404.html'];
  for (const route of routes) {
    const html = await readFile(route, 'utf8');
    assert.match(html, /<h1[^>]*tabindex="-1"/);
    assert.match(html, /class="route-status" role="status" aria-live="polite"/);
    assert.match(html, /route-focus\.js/);
  }
});

test('the shipped integration command serializes browser files with shared local resources', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(manifest.scripts.test, /node --test --test-concurrency=1/);
  assert.match(manifest.scripts.build, /^npm test/);
});
