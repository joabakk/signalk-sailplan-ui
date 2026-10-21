# Changelog

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
