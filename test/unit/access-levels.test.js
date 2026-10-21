const test = require('node:test');
const assert = require('node:assert');

const { setup } = require('../helpers/harness');

// Signal K 2.x treats every /plugins/<id>/... route as admin-only unless the
// plugin opens it with router.access(level). An MFD proxy injects a
// readwrite/readonly device token, so the routes it needs must be opened.

test('reading the state and the image is opened to readonly users', (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  assert.strictEqual(router.levels['GET /state'], 'readonly');
  assert.strictEqual(router.levels['GET /image'], 'readonly');
});

test('uploading an image and editing hotspots stay admin-only', (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  // registered, but with no access level, which means admin on a real server
  assert.ok(router.routes['PUT /image']);
  assert.ok(router.routes['PUT /hotspots']);
  assert.strictEqual(router.levels['PUT /image'], undefined);
  assert.strictEqual(router.levels['PUT /hotspots'], undefined);
});

test('every opened route is a GET', (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  for (const key of Object.keys(router.levels)) {
    assert.match(key, /^GET /, key + ' must not be opened to non-admins');
  }
});

test('no route uses the reserved / or /config paths', (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  for (const key of Object.keys(router.routes)) {
    const path = key.split(' ')[1];
    assert.ok(path !== '/' && path !== '/config', key + ' is reserved by the server');
  }
});

test('falls back to plain registration when router.access is missing', (t) => {
  const { app, router } = setup(undefined, { access: false });
  t.after(app.cleanup);
  assert.strictEqual(router.access, undefined);
  assert.deepStrictEqual(Object.keys(router.routes).sort(), [
    'GET /image',
    'GET /state',
    'PUT /hotspots',
    'PUT /image'
  ]);
  assert.deepStrictEqual(router.levels, {});
});
