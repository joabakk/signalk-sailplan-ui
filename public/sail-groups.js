/*
 * Sails that cannot fly together, such as a screecher and two spinnakers set
 * on the same halyard. Hotspots that carry the same `group` belong to sails of
 * which only one is set at a time.
 *
 * Plain script (no modules, no modern syntax) so it loads in an MFD browser;
 * it also exports itself for the unit tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SailGroups = factory();
  }
})(this, function () {
  // Ids of the set sails to stow when the sail of `setting` is set.
  function sailsToStow(hotspots, inventory, setting) {
    var group = setting.group;
    if (!group) return [];
    var ids = [];
    hotspots.forEach(function (h) {
      if (h.group !== group || h.sailId === setting.sailId) return;
      var sail = inventory[h.sailId];
      if (sail && sail.active && ids.indexOf(h.sailId) === -1) ids.push(h.sailId);
    });
    return ids;
  }

  return { sailsToStow: sailsToStow };
});
