# Changelog

## 0.4.0

- Add a plotter extension (Plotter Extensions API v1, tested with Freeboard-SK 3.3.0): a **Sail Plan** toolbar button that opens the sail plan as a floating window, and a **Sails set** widget showing the area set and which sails are flying. The plugin registers the `plotterExtensions` manifest and serves the iframe assets from `/plotterext/signalk-sailplan-ui/`, a public route, since `/plugins/` is admin-only. The panel is the existing embed mode. Vendors the MIT-licensed `signalk-plotterext-bus` 0.24.0 client. A server without a resources API starts the plugin without the extension.
- Documentation: `sailsconfiguration` 1.2.1 opens its routes to `readonly`/`readwrite` tokens (SignalK/sailsconfiguration#12), so a `readwrite` token can now set sails.

## 0.3.0

- Add embed mode: `/signalk-sailplan-ui/?embed=1` shows only the clickable diagram and the area readout, so another page (for example signalk-logbook) can use it in an iframe. The page sends `ready` and `sail-changed` messages to its host with `postMessage`, to the app's own origin or to the one named in `?origin=`, never to `*`. Documented in the README.

## 0.2.1

- Fix the webapp showing "No sail plan uploaded yet" on an MFD behind signalk-navico-embedder. The inline script used optional chaining, which Chromium 69 cannot parse, and the embedder only transpiles external scripts, so nothing ran and the default message stayed. The app code is now an external `app.js` written without newer syntax. Verified in a real Chromium 69, both through the embedder and directly.
- The page now says "Loading…" until the script has run, and if it never starts it says so instead of looking like an empty plan.
- Use margins instead of flex `gap`, which Chromium 69 ignores, so the header buttons no longer touch.
- Add `.npmignore` so `.claude/` and `test/` are not published.
- Tests that keep newer syntax out of the browser scripts and the app code out of an inline script.

## 0.2.0

- Open `GET /state` and `GET /image` to readonly users with `router.access('readonly')`, falling back to plain routes on servers without `router.access`. Signal K 2.x makes every `/plugins/<id>/...` route admin-only unless opened, and a device token such as the one signalk-navico-embedder injects is never admin. Uploading an image and editing hotspots stay admin-only.
- Serve the same two reads read-only under `/signalk/v1/api/signalk-sailplan-ui/` (`plugin.signalKApiRoutes`), and make the webapp read from there, so it also works behind proxies that only forward `/signalk` and on servers without `router.access`.
- Report failures in the webapp with method, path and status: 401 (Signal K refused; says who you are logged in as), 403 (blocked by a proxy in front of Signal K), 404 on a read as "No data" rather than an error. Replaces the generic "Failed to update sail state" and the blank page on a failed load.
- Document the access levels, what the MFD needs, and what `sailsconfiguration` must change to allow setting sails from a `readwrite` token.
- Tests for the access level of every route, the fallback without `router.access`, the readonly mirror, and the failure messages.

## 0.1.4

- Add offline unit tests (`npm test`, Node's built-in `node:test`) covering plugin load, schema, start/stop and all REST routes.
- Declare `repository`, `author` and `engines` in `package.json`.
- Declare an AppStore screenshot via `signalk.screenshots`.
- Add this changelog.

## 0.1.3

- Fix blank webapp launcher icon: `signalk.appIcon` is resolved relative to `public/`.

## 0.1.2

- Add an app icon cropped from the example sail plan, used as favicon and launcher icon.

## 0.1.1

- Add README with usage guide, example sail plan image and app screenshot.

## 0.1.0

- Initial release: upload a sail plan image, draw clickable hotspots mapped to sails/reefs from `@signalk/sailsconfiguration`, and set the flying sails by clicking.
- Store state under `/state` (not `/config`, which the server reserves).
- Inject `width`/`height` into uploaded SVGs that only declare a `viewBox`.
- Live sail area readout.
