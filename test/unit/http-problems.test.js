const test = require('node:test');
const assert = require('node:assert');

const { describe, parseLoginStatus } = require('../../public/http-problems.js');

const rw = { loggedIn: true, level: 'readwrite', username: 'navico-mfd' };

test('401 without login info says it cannot tell not-logged-in from too-low access', () => {
  const r = describe({ method: 'GET', path: '/plugins/x/state', status: 401 });
  assert.strictEqual(r.kind, 'error');
  assert.match(r.text, /^401 Signal K refused GET \/plugins\/x\/state/);
  assert.match(r.text, /Not logged in, or .* too low an access level/);
});

test('401 when not logged in says so', () => {
  const r = describe({ method: 'PUT', path: '/a', status: 401, login: { loggedIn: false } });
  assert.match(r.text, /You are not logged in\./);
});

test('401 for a readwrite login on a plugin route points at router.access', () => {
  const r = describe({ method: 'PUT', path: '/plugins/sailsconfiguration/sails/main/active', status: 401, login: rw });
  assert.match(r.text, /Logged in as navico-mfd \(readwrite\)\./);
  assert.match(r.text, /router\.access\(\)/);
  assert.match(r.text, /admin-only/);
});

test('401 for a readonly login on a non-plugin route names the level', () => {
  const r = describe({ method: 'PUT', path: '/signalk/v1/api/x', status: 401, login: { loggedIn: true, level: 'readonly', username: 'u' } });
  assert.match(r.text, /needs more than readonly access/);
});

test('401 for admin suggests a bad token', () => {
  const r = describe({ method: 'GET', path: '/a', status: 401, login: { loggedIn: true, level: 'admin', username: 'root' } });
  assert.match(r.text, /Even admin was refused/);
});

test('403 is reported as a proxy block, distinct from a 401', () => {
  const r403 = describe({ method: 'GET', path: '/plugins/signalk-sailplan-ui/state', status: 403 });
  const r401 = describe({ method: 'GET', path: '/plugins/signalk-sailplan-ui/state', status: 401 });
  assert.strictEqual(r403.kind, 'error');
  assert.match(r403.text, /^403 Blocked before reaching Signal K/);
  assert.match(r403.text, /\/plugins\/signalk-sailplan-ui\/state/);
  assert.match(r403.text, /allowlist/);
  assert.doesNotMatch(r403.text, /Signal K refused/);
  assert.doesNotMatch(r401.text, /Blocked before reaching/);
});

test('404 on a read is "no data", not an error, and carries the hint', () => {
  const r = describe({ method: 'GET', path: '/signalk/v1/api/vessels/self/sails/inventory', status: 404, read: true, emptyHint: 'Is it enabled?' });
  assert.strictEqual(r.kind, 'nodata');
  assert.strictEqual(r.text, 'No data at /signalk/v1/api/vessels/self/sails/inventory. Is it enabled?');
});

test('404 on a write is an error: the route does not exist', () => {
  const r = describe({ method: 'PUT', path: '/plugins/nope/x', status: 404 });
  assert.strictEqual(r.kind, 'error');
  assert.match(r.text, /does not exist/);
});

test('5xx and other statuses name the status, method and path', () => {
  assert.match(describe({ method: 'GET', path: '/p', status: 500 }).text, /^500 Server error on GET \/p/);
  assert.match(describe({ method: 'GET', path: '/p', status: 418 }).text, /^418 GET \/p failed/);
});

test('a network error names the path', () => {
  const r = describe({ method: 'GET', path: '/p', networkError: true });
  assert.strictEqual(r.kind, 'error');
  assert.match(r.text, /^Could not reach \/p \(GET\)/);
});

test('parseLoginStatus reads Signal K\'s loginStatus answer', () => {
  assert.deepStrictEqual(parseLoginStatus({ status: 'loggedIn', userLevel: 'readwrite', username: 'dev' }),
    { loggedIn: true, level: 'readwrite', username: 'dev' });
  assert.deepStrictEqual(parseLoginStatus({ status: 'notLoggedIn' }),
    { loggedIn: false, level: null, username: null });
  assert.strictEqual(parseLoginStatus(null), null);
  assert.strictEqual(parseLoginStatus('nope'), null);
});
