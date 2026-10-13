const test = require('node:test');
const assert = require('node:assert');

const { makeApp, createPlugin } = require('../helpers/harness');

test('exports a plugin with id, name, start and stop', () => {
  const app = makeApp();
  try {
    const plugin = createPlugin(app);
    assert.strictEqual(plugin.id, 'signalk-sailplan-ui');
    assert.strictEqual(typeof plugin.name, 'string');
    assert.strictEqual(typeof plugin.start, 'function');
    assert.strictEqual(typeof plugin.stop, 'function');
    assert.strictEqual(typeof plugin.registerWithRouter, 'function');
  } finally {
    app.cleanup();
  }
});

test('schema is an object schema with defaults', () => {
  const app = makeApp();
  try {
    const { schema } = createPlugin(app);
    assert.strictEqual(schema.type, 'object');
    assert.strictEqual(schema.properties.sailsConfigPluginId.default, 'sailsconfiguration');
    assert.strictEqual(schema.properties.pollInterval.default, 4);
  } finally {
    app.cleanup();
  }
});

test('start and stop work with and without options', () => {
  const app = makeApp();
  try {
    const plugin = createPlugin(app);
    plugin.start();
    plugin.stop();
    plugin.start({ pollInterval: 10 });
    plugin.stop();
  } finally {
    app.cleanup();
  }
});
