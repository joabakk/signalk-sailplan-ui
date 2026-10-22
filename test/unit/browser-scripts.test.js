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
  // Only the small boot guard may stay inline, so the embedder transpiles the rest.
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.strictEqual(inline.length, 1);
  assert.ok(inline[0].length < 800, 'inline script grew to ' + inline[0].length + ' characters');
  assert.match(inline[0], /sailplanStarted/);
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
