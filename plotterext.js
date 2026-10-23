/*
 * Plotter Extensions API v1 (Freeboard-SK and other hosts): a "Sail Plan" tile that shows
 * which sails are set, and the clickable sail plan itself as a window or panel.
 *
 * Two server-side jobs:
 *  1. A read-only `plotterExtensions` resource provider whose single entry is the manifest.
 *     The server removes it when the plugin stops, which takes the extension off the host.
 *  2. The extension's iframe assets, served from a public prefix. `/plugins/*` is admin-only,
 *     so it cannot be used, and the plugin has no express of its own, hence the small handler.
 *
 * The panel is the webapp itself in embed mode (index.html?embed=1), so nothing is duplicated.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

// Shared by the toolbar button and the tile, which (in ext-tile.js) opens the same window.
const WINDOW_GEOMETRY = {
  anchor: 'bottom-right',
  offset: { x: 16, y: 16 },
  width: '45%',
  height: '75%',
  minWidth: 320,
  minHeight: 320
};

function buildManifest(assetBase, version) {
  return {
    name: 'Sail Plan',
    description: 'Which sails are set and how much area, at a glance, with the clickable sail plan one tap away.',
    version,
    apiVersion: '1',
    // The panel is what everything else opens, so it is the one thing a host must support.
    requires: ['panels.iframe'],
    optional: ['widgets', 'buttons', 'windows'],
    widgets: [
      {
        id: 'sails-tile',
        title: 'Sails set',
        type: 'iframe',
        // ?v= makes the host reload its iframe when the plugin is updated
        url: `${assetBase}/ext-tile.html?v=${version}`,
        size: '2x1',
        lifecycle: 'whileEnabled'
      }
    ],
    panels: [
      {
        id: 'sailplan',
        title: 'Sail Plan',
        type: 'iframe',
        url: `${assetBase}/index.html?embed=1&v=${version}`,
        lifecycle: 'onOpen'
      }
    ],
    buttons: [
      {
        id: 'open-sailplan',
        title: 'Sail Plan',
        slot: 'mapToolbar',
        icon: 'sailing',
        // A host without `windows` maps toggleWindow to togglePanel.
        action: { type: 'toggleWindow', panel: 'sailplan', title: 'Sail Plan', geometry: WINDOW_GEOMETRY, restoreKey: 'sailplan' }
      }
    ]
  };
}

// Serves regular files under `root` only. Anything else, or any path that resolves outside
// `root`, falls through to the next handler.
function staticAssetHandler(root, assetBase) {
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let urlPath = (req.path !== undefined ? req.path : req.url) || '/';
    const query = urlPath.indexOf('?');
    if (query >= 0) urlPath = urlPath.slice(0, query);
    if (urlPath.startsWith(assetBase)) urlPath = urlPath.slice(assetBase.length);
    if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    let resolved;
    try {
      resolved = path.normalize(path.join(rootPrefix, decodeURIComponent(urlPath)));
    } catch (e) {
      return next(); // malformed percent-encoding
    }
    if (!resolved.startsWith(rootPrefix)) return next();

    fs.stat(resolved, (statErr, stat) => {
      if (statErr || !stat.isFile()) return next();
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[path.extname(resolved)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (req.method === 'HEAD') return res.end();
      fs.readFile(resolved, (readErr, data) => (readErr ? next() : res.end(data)));
    });
  };
}

// Offers the manifest to hosts. Called on every start: the server drops the provider on stop.
function registerManifestProvider(app, id, manifest) {
  app.registerResourceProvider({
    type: 'plotterExtensions',
    methods: {
      listResources: async () => ({ [id]: manifest }),
      getResource: async (resourceId) => {
        if (resourceId !== id) throw new Error('No such plotterExtensions resource: ' + resourceId);
        return manifest;
      },
      setResource: async () => {
        throw new Error(id + ' is a read-only provider');
      },
      deleteResource: async () => {
        throw new Error(id + ' is a read-only provider');
      }
    }
  });
}

module.exports = { buildManifest, staticAssetHandler, registerManifestProvider, PUBLIC_DIR, MIME };
