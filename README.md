# Copenhagen Weather — Samsung Tizen TV app

[![CI](https://github.com/cocodedk/copenhagen-weather-tv/actions/workflows/ci.yml/badge.svg)](https://github.com/cocodedk/copenhagen-weather-tv/actions/workflows/ci.yml)
[![Pages](https://github.com/cocodedk/copenhagen-weather-tv/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/cocodedk/copenhagen-weather-tv/actions/workflows/deploy-pages.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A packaged web app (`.wgt`) for Samsung Smart TVs: current conditions, 24-hour
outlook and a 7-day forecast for Copenhagen, driven entirely by the remote.

Data: [Open-Meteo](https://open-meteo.com), free, no API key, CORS-open.
Location is hardcoded to 55.6761 N, 12.5683 E, timezone `Europe/Copenhagen`.

## Website

- [English](https://cocodedk.github.io/copenhagen-weather-tv/)
- [Dansk](https://cocodedk.github.io/copenhagen-weather-tv/da/)
- [فارسی (Persian)](https://cocodedk.github.io/copenhagen-weather-tv/fa/)

Each page shows the live Copenhagen forecast and embeds the app itself, running at
1920×1080 and drivable with the arrow keys:
[**open the demo**](https://cocodedk.github.io/copenhagen-weather-tv/demo/).

There is no release artifact to download. A `.wgt` must be signed with *your* author
certificate and, on many retail sets, bound to your TV's DUID, so a prebuilt package
would not install for anyone else. Build it locally instead:

## Quick start

```bash
npm install && npx playwright install chromium
./scripts/install-hooks.sh

./build.sh                          # lint + package -> dist/CopenhagenWeather.wgt
./build.sh --test                   # also run the desktop test suite first
./build.sh --install 192.168.0.201  # package, install and launch on that TV
```

Signing profile defaults to `BabakTV`; override with `TIZEN_PROFILE=<name>`.

Before `--install`, put the TV in developer mode: **Apps** panel → type `12345`
→ **Developer mode ON** → set **Host PC IP** to this machine → reboot the TV.

## Using it

| Remote | Action |
|---|---|
| ← → ↑ ↓ | Move between the hourly strip (top row) and the day cards (bottom row) |
| **OK** | On a day card: show that day's summary + its 24 hours |
| **1**–**7** | Jump straight to a day (1 = today) |
| **RED** | Refresh now |
| **GREEN** | Toggle °C/m·s⁻¹ ↔ °F/mph (saved) |
| **YELLOW** | Cycle theme: auto → day → night (saved) |
| **BLUE** | Diagnostics overlay |
| **BACK** | Return to Today; at Today, confirm-then-exit |

The forecast refreshes every 10 minutes, on returning from standby, and on RED.
The last good response is cached in `localStorage`, so a cold start with no
network still paints a forecast (marked *Offline*).

## Layout

```
index.html      one page, inline SVG icon sprite (no external images -> no CORS)
config.xml      Tizen manifest: <access>, CSP, internet + tv.inputdevice privileges
css/app.css     theme variables, header, hero, stat grid
css/widgets.css hourly strip, day cards, footer, overlays, focus ring
js/wmo.js       WMO weather code -> label + icon        ┐
js/units.js     unit conversion + date/time formatting │ shared with the website
js/api.js       Open-Meteo client, cache               ┘
js/nav.js       D-pad focus engine (logical row/col + scopes)
js/render.js    DOM rendering, registers focusables with nav
js/app.js       bootstrap, key routing, refresh loop, diagnostics overlay
website/        GitHub Pages site (EN / DA / FA) — targets modern browsers
tools/          desktop-only: compat lint, test suites, site assembly, OG render
tests/fixtures/ recorded API response the test suites run against
```

The three shared modules are copied into the site by `tools/build-site.mjs` rather
than duplicated, so a weather-label or rounding fix cannot apply to only one of
them. Keep them free of DOM and of anything TV-specific.

## Engine ceiling — read this before editing

The TV renders in a Chromium frozen to its firmware and it will never update.
This app is authored to **Chromium 69** (Tizen 5.5, ~2020 sets), which also
covers the Chromium 76 of Tizen 6.0. No build step, no transpiler.

Deliberately not used: flex `gap` (needs 84), `clamp()/min()/max()` (79),
`inset` (87), `:is()/:where()` (88), `aspect-ratio` (88), `:focus-visible` (86),
`?.` and `??` (80), `replaceAll` (85), `Array.at` (92).

Two non-version-gated traps that are handled in the CSS and worth preserving:

- Every `#id` that sets its own `display` also needs `#id[hidden]{display:none
  !important}` — id specificity outranks the `[hidden]` attribute rule, so
  `.hidden = true` silently fails otherwise. See the overlays in `widgets.css`.
- `#stats` declares **explicit** `grid-template-rows`. With `auto` rows,
  Chromium 76 squishes them to fit the container and the tiles collapse.

`node tools/compat-lint.mjs` enforces the list above. Run it after every edit —
the desktop smoke test runs a *modern* Chromium and will happily accept features
the TV lacks, so a green test proves nothing about compatibility. Both run
automatically in `build.sh`.

## Testing without a TV

```bash
npm run check        # everything CI runs
npm run smoke        # TV app only        -> shots/
npm run site-check   # website only       -> shots/site/
npm run live-check   # both, against the real Open-Meteo API
```

Both suites run against `tests/fixtures/forecast.json` by default, so they are
deterministic and need no network. CI must never depend on a live third party.

`npm run smoke` serves the app, opens it at exactly 1920×1080, then:

- asserts nothing overflows 1920×1080 and no row collapsed (the failure mode the
  old grid/flex engine actually produces), and that no stat text is clipped;
- checks every rendered value against the fixture, including cross-checking the
  hand-rolled Sakamoto weekday in `units.js` against the platform's date library;
- walks the D-pad with **synthetic keydowns that force `keyCode`**. Synthetic
  events default it to `0`, the classic "only works with a real remote" bug;
- exercises every colour key, the number keys, both Back levels and the exit dialog;
- kills the network, reloads, and verifies the cached-forecast fallback.

`npm run site-check` loads all three languages at 360 / 390 / 768 / 1280 px and
asserts no horizontal scroll (naming the widest element when it fails), body text
≥ 16px, one `<h1>`, no skipped heading levels, that translations reached the DOM,
and that the embedded demo really booted the TV app.

`tizen` and `webapis` are undefined on the desktop, so every call to them is
wrapped in try/catch and the same build runs in both places.

## Debugging on the TV (there is no DevTools)

- **Build stamp**, bottom-right. Bump `BUILD` in `js/app.js` every deploy — a
  reinstall does not always reload the page, and this is the only on-screen proof
  the TV is running your new code.
- **BLUE key** opens the diagnostics overlay: user agent, measured element sizes
  (the layout-collapse detector), API state, last error, focus position. On-device
  measurement is often the only way to see *why* a layout collapsed.
- **`sdb shell` and `dlog` do not work on this retail set.** Verified on
  UE50AU8005KXXC: `sdb shell` returns empty or `closed`, and both `dlog` and
  `dlogutil` return nothing at all. So there is no device-side log channel and no
  way to query whether the app is running — the on-screen overlay and the build
  stamp are the whole toolkit. (The same finding is recorded in the sibling
  `night_gallery` project's installer.)

Two install traps that cost real time, both handled in `build.sh`:

- **Launch with `tizen run -p <app-id> -t <name>`.** `sdb shell 0 app_launcher -s`
  exits 0 having done nothing, because sdb shell is dead on retail TVs.
- **`tizen -t` wants the device NAME** (column 3 of `sdb devices`, e.g.
  `UE50AU8005KXXC`), not the `ip:port` from column 1 — the address fails with
  *"There is no 192.168.0.201:26101 target."* Relatedly, a `.wgt` whose filename
  contains a space fails to install with a silent, reasonless error, which is why
  the archive is renamed off `tizen package`'s default `Copenhagen Weather.wgt`.

## Adjusting the target

- **2020 or older TV (Tizen 5.5):** set `required_version="5.5"` in `config.xml`.
  `required_version` must be ≤ the TV's platform or the install is rejected, and
  it packages fine without the 5.5 platform installed locally. The code already
  respects that engine.
- **Another city:** change `LAT`/`LON`/`TZ` in `js/api.js` and the `#city` /
  `#subtitle` text in `index.html`.
- **If `tizen install` is rejected** with a signature or authorization error, the
  TV needs the official Samsung route instead of a self-signed cert: create a
  Samsung author + distributor certificate in Tizen Studio's Certificate Manager
  and register every target TV's DUID (**Menu → Support → About This TV**) *up
  front*, because the DUID list cannot be edited afterwards. Then run Device
  Manager → **Permit to Install**.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: `npm run check` must pass, the
Chromium-69 ceiling is enforced by a lint on every commit, and app changes should
be verified on a real set with the build stamp bumped.

## Author

**Babak Bandpey** — [cocode.dk](https://cocode.dk) | [LinkedIn](https://linkedin.com/in/babakbandpey) | [GitHub](https://github.com/cocodedk)

## License

Apache-2.0 | © 2026 [Cocode](https://cocode.dk) | Created by [Babak Bandpey](https://linkedin.com/in/babakbandpey)
