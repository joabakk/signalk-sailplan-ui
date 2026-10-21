const test = require('node:test');
const assert = require('node:assert');

const { makeApp, makeRouter, createPlugin, setup, call } = require('../helpers/harness');

// signalk-mfd-plugin tiles (and any client without an admin session) can only
// reach /signalk/v1/api, because /plugins/<id> is admin-only.

function dataUrl(mime, content) {
  return 'data:' + mime + ';base64,' + Buffer.from(content).toString('base64');
}

test('signalKApiRoutes returns the router it was given', (t) => {
  const app = makeApp();
  t.after(app.cleanup);
  const plugin = createPlugin(app);
  const router = makeRouter();
  assert.strictEqual(plugin.signalKApiRoutes(router), router);
});

test('readonly mirror is GET-only and namespaced by plugin id', (t) => {
  const { app, apiRouter } = setup();
  t.after(app.cleanup);
  assert.deepStrictEqual(Object.keys(apiRouter.routes).sort(), [
    'GET /signalk-sailplan-ui/image',
    'GET /signalk-sailplan-ui/state'
  ]);
});

test('readonly /state matches the admin /state', async (t) => {
  const { app, router, apiRouter } = setup({ sailsConfigPluginId: 'my-sails', pollInterval: 7 });
  t.after(app.cleanup);
  await call(router, 'PUT', '/hotspots', [{ id: 'h1', sailId: 'main', reefs: 0, points: [[1, 2], [3, 4], [5, 6]] }]);
  const admin = await call(router, 'GET', '/state');
  const readonly = await call(apiRouter, 'GET', '/signalk-sailplan-ui/state');
  assert.deepStrictEqual(readonly.body, admin.body);
  assert.strictEqual(readonly.body.hotspots[0].sailId, 'main');
});

test('readonly /image is 404 before upload, then serves the stored image', async (t) => {
  const { app, router, apiRouter } = setup();
  t.after(app.cleanup);
  const before = await call(apiRouter, 'GET', '/signalk-sailplan-ui/image');
  assert.strictEqual(before.statusCode, 404);

  await call(router, 'PUT', '/image', { dataUrl: dataUrl('image/png', 'fakepng') });
  const after = await call(apiRouter, 'GET', '/signalk-sailplan-ui/image');
  assert.strictEqual(after.type, 'image/png');
  assert.strictEqual(after.body.toString(), 'fakepng');
});
