const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { makeApp, createPlugin } = require('../helpers/harness');
const { buildManifest, staticAssetHandler, registerManifestProvider, PUBLIC_DIR } = require('../../plotterext');

const BASE = '/plotterext/signalk-sailplan-ui';

test('the manifest is a consistent Plotter Extensions API v1 manifest', () => {
  const m = buildManifest(BASE, '1.2.3');
  assert.strictEqual(m.apiVersion, '1');
  assert.strictEqual(m.version, '1.2.3');
  assert.deepStrictEqual(m.requires, ['panels.iframe']);

  const panelIds = m.panels.map((p) => p.id);
  assert.deepStrictEqual(panelIds, ['sailplan']);
  // every button opens a panel the manifest has
  for (const button of m.buttons) assert.ok(panelIds.includes(button.action.panel), button.id);

  for (const item of [...m.widgets, ...m.panels]) {
    assert.strictEqual(item.type, 'iframe');
    assert.ok(item.url.startsWith(BASE + '/'), item.id + ' must be served from the public prefix');
    assert.ok(item.url.includes('v=1.2.3'), item.id + ' needs the version so a host reloads it');
  }
  assert.match(m.widgets[0].size, /^[12]x[12]$/);
  // the panel is the webapp in embed mode, and the widget is a page this repo ships
  assert.match(m.panels[0].url, /\/index\.html\?embed=1&/);
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'index.html')));
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'ext-tile.html')));
});

test('the manifest never asks for more than the panel as a requirement', () => {
  // a host without widgets or buttons should still offer the panel
  const m = buildManifest(BASE, '1.0.0');
  assert.ok(!m.requires.includes('widgets'));
  assert.ok(!m.requires.includes('buttons'));
  assert.ok(m.optional.includes('windows'));
});

// ---- static assets

function serve(url, method) {
  const handler = staticAssetHandler(PUBLIC_DIR, BASE);
  return new Promise((resolve) => {
    const res = {
      headers: {},
      statusCode: undefined,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(body) { resolve({ served: true, status: this.statusCode, headers: this.headers, body }); }
    };
    handler({ method: method || 'GET', url, path: url.split('?')[0] }, res, () => resolve({ served: false }));
  });
}

test('serves the extension assets with the right types', async () => {
  const html = await serve(BASE + '/ext-tile.html?v=1');
  assert.strictEqual(html.status, 200);
  assert.match(html.headers['content-type'], /^text\/html/);
  const js = await serve(BASE + '/vendor/plotterext-bus/extension.js');
  assert.match(js.headers['content-type'], /^text\/javascript/);
  assert.ok(js.body.length > 100);
  // the directory maps to the webapp itself, which is the panel
  const root = await serve(BASE + '/');
  assert.strictEqual(root.status, 200);
  assert.match(root.body.toString(), /<title>Sail Plan<\/title>/);
});

test('HEAD answers without a body and other methods fall through', async () => {
  const head = await serve(BASE + '/ext-tile.html', 'HEAD');
  assert.strictEqual(head.status, 200);
  assert.strictEqual(head.body, undefined);
  assert.strictEqual((await serve(BASE + '/ext-tile.html', 'POST')).served, false);
});

test('anything outside the public directory falls through', async () => {
  for (const url of [
    BASE + '/../package.json',
    BASE + '/%2e%2e/package.json',
    BASE + '/..%2f..%2findex.js',
    BASE + '/%zz',
    BASE + '/does-not-exist.js',
    BASE + '/vendor'
  ]) {
    assert.strictEqual((await serve(url)).served, false, url);
  }
});

test('the tile only imports files that are shipped', () => {
  const source = fs.readFileSync(path.join(PUBLIC_DIR, 'ext-tile.js'), 'utf8');
  const imports = [...source.matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  for (const rel of imports) assert.ok(fs.existsSync(path.join(PUBLIC_DIR, rel)), rel);
  // and what that vendored file imports in turn, with its licence alongside
  const vendor = path.join(PUBLIC_DIR, 'vendor', 'plotterext-bus');
  for (const m of fs.readFileSync(path.join(vendor, 'extension.js'), 'utf8').matchAll(/from "(\.[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(vendor, m[1])), m[1]);
  }
  assert.ok(fs.existsSync(path.join(vendor, 'LICENSE')));
});

// ---- resource provider

test('the provider lists the manifest and refuses writes', async () => {
  let provider;
  registerManifestProvider({ registerResourceProvider: (p) => { provider = p; } }, 'my-id', { name: 'x' });
  assert.strictEqual(provider.type, 'plotterExtensions');
  assert.deepStrictEqual(await provider.methods.listResources(), { 'my-id': { name: 'x' } });
  assert.deepStrictEqual(await provider.methods.getResource('my-id'), { name: 'x' });
  await assert.rejects(provider.methods.getResource('other'), /No such plotterExtensions resource/);
  await assert.rejects(provider.methods.setResource(), /read-only/);
  await assert.rejects(provider.methods.deleteResource(), /read-only/);
});

// ---- plugin wiring

function appWith(extra) {
  const app = makeApp();
  app.registered = [];
  app.mounted = [];
  app.errors = [];
  return Object.assign(app, {
    registerResourceProvider: (p) => app.registered.push(p),
    use: (base) => app.mounted.push(base),
    error: (m) => app.errors.push(m)
  }, extra);
}

test('start offers the extension and mounts the assets once, however often it restarts', (t) => {
  const app = appWith();
  t.after(app.cleanup);
  const plugin = createPlugin(app);
  plugin.start({});
  plugin.stop();
  plugin.start({});
  assert.strictEqual(app.registered.length, 2, 'the server drops the provider on stop, so each start registers it');
  assert.deepStrictEqual(app.mounted, [BASE], 'app.use cannot be undone, so it is mounted once');
});

test('a server without a resources API still starts the plugin', (t) => {
  const app = makeApp();
  t.after(app.cleanup);
  assert.doesNotThrow(() => createPlugin(app).start({}));
});

test('a failing registration is reported and does not stop the plugin', (t) => {
  const app = appWith({ registerResourceProvider: () => { throw new Error('boom'); } });
  t.after(app.cleanup);
  assert.doesNotThrow(() => createPlugin(app).start({}));
  assert.match(app.errors[0], /Could not offer the plotter extension: boom/);
});
