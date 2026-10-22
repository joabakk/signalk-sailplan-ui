const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// The webapp also runs on an MFD through signalk-navico-embedder, whose browser is
// Chromium 69. The embedder only transpiles external scripts, never an inline
// <script>, and a script the browser cannot parse never runs, which leaves the page
// looking like an empty sail plan. These tests keep that from coming back.

const publicDir = path.join(__dirname, '..', '..', 'public');
const read = (name) => fs.readFileSync(path.join(publicDir, name), 'utf8');
const html = read('index.html');

// Optional chaining and nullish coalescing are the newer syntax that broke it
// (Chrome 80 and 80). A `?.` after an identifier or bracket, or any `??`.
const NEWER_SYNTAX = /[A-Za-z0-9_\])]\?\.[A-Za-z_[(]|\?\?/;

test('browser scripts avoid syntax that Chromium 69 cannot parse', () => {
  for (const name of ['app.js', 'http-problems.js']) {
    const match = NEWER_SYNTAX.exec(read(name));
    assert.strictEqual(match, null, name + ' uses ' + (match && match[0]));
  }
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const code of inline) {
    assert.strictEqual(NEWER_SYNTAX.exec(code), null, 'inline script uses newer syntax');
  }
});

test('the app code is an external script, not inline', () => {
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.match(html, /<script src="http-problems\.js"><\/script>/);
  // Only two small inline scripts may stay (the embed marker and the boot guard), so
  // the embedder transpiles everything else.
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.strictEqual(inline.length, 2);
  const total = inline.reduce((n, code) => n + code.length, 0);
  assert.ok(total < 1000, 'inline scripts grew to ' + total + ' characters');
  assert.ok(inline.some((code) => /sailplanStarted/.test(code)), 'boot guard missing');
  assert.ok(inline.some((code) => /embed=1/.test(code)), 'embed marker missing');
});

test('the page says "Loading" until app.js has run, and app.js marks that it started', () => {
  assert.match(html, /<div id="empty-msg">Loading…<\/div>/);
  assert.doesNotMatch(html, /No sail plan uploaded yet/);
  assert.match(read('app.js'), /window\.sailplanStarted = true/);
  assert.match(read('app.js'), /No sail plan uploaded yet/);
});

test('layout does not rely on flex gap, which Chromium 69 ignores', () => {
  assert.doesNotMatch(html, /[\s;{]gap\s*:/);
});

test('?embed=1 hides the setup tools before the page is drawn', () => {
  // the marker runs in <head>, ahead of the body
  assert.ok(html.indexOf("className += ' embed'") < html.indexOf('<body>'));
  for (const selector of ['h1', '#upload-btn', '#mode-btn', '#sidebar']) {
    assert.ok(html.includes('html.embed ' + selector), selector + ' is not hidden in embed mode');
  }
});

test('embed messages are tagged, versioned and never sent to any origin', () => {
  const app = read('app.js');
  assert.match(app, /source: 'signalk-sailplan-ui', version: 1/);
  assert.match(app, /type: 'ready'/);
  assert.match(app, /type: 'sail-changed'/);
  // the target origin is always computed, never the wildcard
  assert.doesNotMatch(app, /postMessage\([^;]*['"]\*['"]/);
  assert.match(app, /\.postMessage\([^;]*parentOrigin\(\)\)/);
});
