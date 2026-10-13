# Changelog

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
