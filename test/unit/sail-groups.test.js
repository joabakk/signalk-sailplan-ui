const test = require('node:test');
const assert = require('node:assert');

const { sailsToStow } = require('../../public/sail-groups.js');

const hotspots = [
  { id: 'a', sailId: 'screecher', group: 'downwind' },
  { id: 'b', sailId: 'spi', group: 'downwind' },
  { id: 'c', sailId: 'asym', group: 'downwind' },
  { id: 'd', sailId: 'asym', reefs: 1, group: 'downwind' },
  { id: 'e', sailId: 'genoa' },
  { id: 'f', sailId: 'main', group: 'other' }
];

test('setting a grouped sail stows the set sails of its group, once each', () => {
  const inventory = { screecher: { active: true }, asym: { active: true }, spi: { active: false }, genoa: { active: true } };
  assert.deepStrictEqual(sailsToStow(hotspots, inventory, hotspots[1]), ['screecher', 'asym']);
});

test('the sail being set is never stowed, even through another of its hotspots', () => {
  const inventory = { asym: { active: true } };
  assert.deepStrictEqual(sailsToStow(hotspots, inventory, hotspots[2]), []);
});

test('a hotspot without a group stows nothing', () => {
  const inventory = { screecher: { active: true }, main: { active: true } };
  assert.deepStrictEqual(sailsToStow(hotspots, inventory, hotspots[4]), []);
});

test('sails missing from the inventory are skipped', () => {
  assert.deepStrictEqual(sailsToStow(hotspots, {}, hotspots[0]), []);
});
