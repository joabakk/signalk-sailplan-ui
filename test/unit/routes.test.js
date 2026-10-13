const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { setup, call } = require('../helpers/harness');

function dataUrl(mime, content) {
  return 'data:' + mime + ';base64,' + Buffer.from(content).toString('base64');
}

test('registers the expected routes', (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  assert.deepStrictEqual(Object.keys(router.routes).sort(), [
    'GET /image',
    'GET /state',
    'PUT /hotspots',
    'PUT /image'
  ]);
  // never shadow the server's own /config route
  assert.ok(!router.routes['GET /config']);
});

test('GET /state returns defaults when nothing is stored', async (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  const res = await call(router, 'GET', '/state');
  assert.deepStrictEqual(res.body, {
    imageUrl: null,
    hotspots: [],
    sailsConfigBase: '/plugins/sailsconfiguration',
    pollInterval: 4
  });
});

test('GET /state reflects plugin options', async (t) => {
  const { app, router } = setup({ sailsConfigPluginId: 'my-sails', pollInterval: 9 });
  t.after(app.cleanup);
  const res = await call(router, 'GET', '/state');
  assert.strictEqual(res.body.sailsConfigBase, '/plugins/my-sails');
  assert.strictEqual(res.body.pollInterval, 9);
});

test('GET /image is 404 before an image is uploaded', async (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  const res = await call(router, 'GET', '/image');
  assert.strictEqual(res.statusCode, 404);
});

test('PUT /image stores a PNG that GET /image serves back', async (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  const put = await call(router, 'PUT', '/image', { dataUrl: dataUrl('image/png', 'fakepng') });
  assert.deepStrictEqual(put.body, { imageUrl: './image' });

  const get = await call(router, 'GET', '/image');
  assert.strictEqual(get.type, 'image/png');
  assert.strictEqual(get.body.toString(), 'fakepng');

  const state = await call(router, 'GET', '/state');
  assert.strictEqual(state.body.imageUrl, './image');
});

test('PUT /image rejects malformed and unsupported uploads', async (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  const missing = await call(router, 'PUT', '/image', {});
  assert.strictEqual(missing.statusCode, 400);
  const garbage = await call(router, 'PUT', '/image', { dataUrl: 'not a data url' });
  assert.strictEqual(garbage.statusCode, 400);
  const gif = await call(router, 'PUT', '/image', { dataUrl: dataUrl('image/gif', 'x') });
  assert.strictEqual(gif.statusCode, 400);
});

test('replacing an image with another type removes the old file', async (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  await call(router, 'PUT', '/image', { dataUrl: dataUrl('image/png', 'a') });
  await call(router, 'PUT', '/image', { dataUrl: dataUrl('image/jpeg', 'b') });
  assert.ok(!fs.existsSync(path.join(app.dataDir, 'sailplan-image.png')));
  assert.ok(fs.existsSync(path.join(app.dataDir, 'sailplan-image.jpeg')));
  const get = await call(router, 'GET', '/image');
  assert.strictEqual(get.type, 'image/jpeg');
});

test('SVG without width/height gets them from the viewBox', async (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800"><rect/></svg>';
  await call(router, 'PUT', '/image', { dataUrl: dataUrl('image/svg+xml', svg) });
  const get = await call(router, 'GET', '/image');
  assert.strictEqual(get.type, 'image/svg+xml');
  assert.match(get.body.toString(), /<svg width="400" height="800"/);
});

test('SVG that already has width/height is left unchanged', async (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  const svg = '<svg width="10" height="20" viewBox="0 0 400 800"></svg>';
  await call(router, 'PUT', '/image', { dataUrl: dataUrl('image/svg+xml', svg) });
  const get = await call(router, 'GET', '/image');
  assert.strictEqual(get.body.toString(), svg);
});

test('PUT /hotspots stores hotspots and rejects non-arrays', async (t) => {
  const { app, router } = setup();
  t.after(app.cleanup);
  const hotspots = [
    { id: 'h1', sailId: 'main', label: 'Main', reefs: 0, points: [[10, 10], [20, 10], [15, 30]] }
  ];
  const put = await call(router, 'PUT', '/hotspots', hotspots);
  assert.deepStrictEqual(put.body, { hotspots });

  const state = await call(router, 'GET', '/state');
  assert.deepStrictEqual(state.body.hotspots, hotspots);

  const bad = await call(router, 'PUT', '/hotspots', { not: 'an array' });
  assert.strictEqual(bad.statusCode, 400);
});

test('stored state survives a plugin restart', async (t) => {
  const first = setup();
  t.after(first.app.cleanup);
  await call(first.router, 'PUT', '/hotspots', [{ id: 'h1', sailId: 'jib', points: [] }]);
  first.plugin.stop();

  // a fresh plugin instance pointed at the same data dir
  const { createPlugin, makeRouter } = require('../helpers/harness');
  const plugin = createPlugin(first.app);
  const router = makeRouter();
  plugin.start({});
  plugin.registerWithRouter(router);
  const state = await call(router, 'GET', '/state');
  assert.strictEqual(state.body.hotspots[0].sailId, 'jib');
});
