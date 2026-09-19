/*
 * signalk-sailplan-ui
 *
 * Stores a sail plan image plus a set of clickable hotspot polygons
 * (each mapped to a sailId + reef level from the @signalk/sailsconfiguration
 * plugin's inventory). The webapp in public/ draws the overlay and, on
 * click, PUTs directly to sailsconfiguration's own REST API
 * (/plugins/sailsconfiguration/sails/:id/active and /reducedState) —
 * this plugin does not duplicate that state, it only owns the image and
 * hotspot geometry.
 */
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const pluginId = 'signalk-sailplan-ui';

module.exports = function (app) {
  const plugin = {};
  const debug = app.debug;

  plugin.id = pluginId;
  plugin.name = 'Sail Plan UI';
  plugin.description =
    'Upload a sail plan diagram and click on sails/reefs to set which are currently flying.';

  // The sail plan image and hotspot geometry are edited from the webapp itself,
  // not this form. This only covers settings needed to talk to the plugin that
  // actually owns sail state (@signalk/sailsconfiguration).
  plugin.schema = {
    type: 'object',
    properties: {
      sailsConfigPluginId: {
        type: 'string',
        title: "Sail state plugin id",
        description:
          "Plugin id of the installed sail inventory/state provider (e.g. @signalk/sailsconfiguration). Hotspots PUT active/reef changes to /plugins/<this id>/sails/...",
        default: 'sailsconfiguration'
      },
      pollInterval: {
        type: 'number',
        title: 'Live status refresh interval (seconds)',
        description: 'How often the webapp re-reads sail state to highlight the currently set sails/reefs.',
        default: 4,
        minimum: 1
      }
    }
  };

  const defaultOptions = { sailsConfigPluginId: 'sailsconfiguration', pollInterval: 4 };
  let pluginOptions = { ...defaultOptions };

  function dataDir() {
    const dir = app.getDataDirPath ? app.getDataDirPath() : path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  function configPath() {
    return path.join(dataDir(), 'sailplan-config.json');
  }

  function imagePath(ext) {
    return path.join(dataDir(), 'sailplan-image' + ext);
  }

  function readConfig() {
    try {
      return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    } catch (e) {
      return { imageExt: null, hotspots: [] };
    }
  }

  function writeConfig(cfg) {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  }

  const EXT_TO_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  };
  const MIME_TO_EXT = Object.fromEntries(
    Object.entries(EXT_TO_MIME).map(([ext, mime]) => [mime, ext])
  );

  // An <img src="...svg"> with only a viewBox and no width/height has no
  // intrinsic size, which renders as 0x0 in some layouts (e.g. a flex
  // parent with no other definite size to fall back to). Hand-authored
  // sail plan SVGs commonly omit width/height, so inject them from the
  // viewBox rather than relying on every consumer's CSS to cope.
  function ensureSvgHasDimensions(buffer) {
    const svg = buffer.toString('utf8');
    const rootTagMatch = svg.match(/<svg\b[^>]*>/i);
    if (!rootTagMatch) return buffer;
    const rootTag = rootTagMatch[0];
    if (/\bwidth\s*=/.test(rootTag) && /\bheight\s*=/.test(rootTag)) return buffer;
    const viewBoxMatch = rootTag.match(
      /\bviewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i
    );
    if (!viewBoxMatch) return buffer;
    const [, vbWidth, vbHeight] = viewBoxMatch;
    const newRootTag = rootTag.replace(/<svg\b/i, `<svg width="${vbWidth}" height="${vbHeight}"`);
    return Buffer.from(svg.replace(rootTag, newRootTag), 'utf8');
  }

  plugin.start = function (options) {
    pluginOptions = { ...defaultOptions, ...(options || {}) };
    debug('starting with options %o', pluginOptions);
  };

  plugin.stop = function () {
    debug('stopping');
  };

  plugin.registerWithRouter = function (router) {
    router.use(bodyParser.json({ limit: '20mb' }));

    // Note: this is deliberately not named /config — Signal K's server reserves
    // GET/POST /plugins/<id>/config for its own enable/configuration mechanism
    // and a route here with that name is shadowed by it.
    // { imageUrl, hotspots, sailsConfigBase, pollInterval }
    router.get('/state', function (req, res) {
      const cfg = readConfig();
      res.json({
        imageUrl: cfg.imageExt ? './image' : null,
        hotspots: cfg.hotspots || [],
        sailsConfigBase: '/plugins/' + pluginOptions.sailsConfigPluginId,
        pollInterval: pluginOptions.pollInterval
      });
    });

    // body: { dataUrl: "data:image/png;base64,...." }
    router.put('/image', function (req, res) {
      const dataUrl = req.body && req.body.dataUrl;
      const match = dataUrl && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        res.status(400).json({ error: 'expected { dataUrl: "data:<mime>;base64,..." }' });
        return;
      }
      const mime = match[1];
      const ext = MIME_TO_EXT[mime];
      if (!ext) {
        res.status(400).json({ error: 'unsupported image type ' + mime });
        return;
      }
      const cfg = readConfig();
      // clean up a previous image with a different extension
      if (cfg.imageExt && cfg.imageExt !== ext && fs.existsSync(imagePath(cfg.imageExt))) {
        fs.unlinkSync(imagePath(cfg.imageExt));
      }
      let imageBuffer = Buffer.from(match[2], 'base64');
      if (ext === '.svg') {
        imageBuffer = ensureSvgHasDimensions(imageBuffer);
      }
      fs.writeFileSync(imagePath(ext), imageBuffer);
      cfg.imageExt = ext;
      writeConfig(cfg);
      res.json({ imageUrl: './image' });
    });

    router.get('/image', function (req, res) {
      const cfg = readConfig();
      if (!cfg.imageExt || !fs.existsSync(imagePath(cfg.imageExt))) {
        res.sendStatus(404);
        return;
      }
      res.contentType(EXT_TO_MIME[cfg.imageExt]);
      fs.createReadStream(imagePath(cfg.imageExt)).pipe(res);
    });

    // body: [{ id, sailId, label, reefs, furledRatio, points: [[xPct,yPct], ...] }, ...]
    router.put('/hotspots', function (req, res) {
      if (!Array.isArray(req.body)) {
        res.status(400).json({ error: 'expected an array of hotspots' });
        return;
      }
      const cfg = readConfig();
      cfg.hotspots = req.body;
      writeConfig(cfg);
      res.json({ hotspots: cfg.hotspots });
    });
  };

  return plugin;
};
