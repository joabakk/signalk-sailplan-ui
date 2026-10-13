/*
 * Minimal stand-ins for the Signal K server app object and an Express router,
 * so the plugin can be exercised offline without a running server.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Writable } = require('stream');

const createPlugin = require('../../index.js');

function makeApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sailplan-ui-test-'));
  return {
    dataDir,
    debug: () => {},
    getDataDirPath: () => dataDir,
    cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true })
  };
}

function makeRouter() {
  const routes = {};
  const middleware = [];
  const router = {
    routes,
    middleware,
    use: (fn) => middleware.push(fn),
    get: (p, fn) => { routes['GET ' + p] = fn; },
    put: (p, fn) => { routes['PUT ' + p] = fn; },
    post: (p, fn) => { routes['POST ' + p] = fn; }
  };
  return router;
}

// A response object that is also a writable stream, so handlers that pipe a
// file into it work. Resolves `done` once the handler has finished responding.
function makeRes() {
  const chunks = [];
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const res = new Writable({
    write(chunk, enc, cb) { chunks.push(Buffer.from(chunk)); cb(); }
  });
  res.statusCode = 200;
  res.body = undefined;
  res.type = undefined;
  res.done = done;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; resolveDone(); return res; };
  res.sendStatus = (code) => { res.statusCode = code; resolveDone(); return res; };
  res.contentType = (t) => { res.type = t; return res; };
  res.on('finish', () => { res.body = Buffer.concat(chunks); resolveDone(); });
  return res;
}

async function call(router, method, p, body) {
  const handler = router.routes[method + ' ' + p];
  if (!handler) throw new Error('no route ' + method + ' ' + p);
  const res = makeRes();
  handler({ body }, res);
  await res.done;
  return res;
}

function setup(options) {
  const app = makeApp();
  const plugin = createPlugin(app);
  const router = makeRouter();
  plugin.start(options);
  plugin.registerWithRouter(router);
  return { app, plugin, router };
}

module.exports = { makeApp, makeRouter, call, setup, createPlugin };
