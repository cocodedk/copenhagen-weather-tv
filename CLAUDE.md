# CLAUDE.md — Copenhagen Weather (Tizen TV)

## Project overview

A Samsung Tizen TV app showing Copenhagen's weather: current conditions, 24-hour
outlook and a 7-day forecast, navigated entirely with the remote. Packaged as a
signed `.wgt` and sideloaded. A GitHub Pages site shows the same live data and
embeds the app as a browsable demo.

- **Language / runtime**: plain JavaScript (no framework, no bundler, no build step)
- **Target engine**: Chromium 69 (Tizen 5.5) — see the ceiling rule below
- **Platform**: Samsung Tizen 6.0+, fixed 1920×1080
- **Data**: Open-Meteo, no API key, CORS-open
- **Package id**: `WxCph00001.CopenhagenWeather`

---

## Required skills — always invoke these

| Situation | Skill |
|-----------|-------|
| Before any new feature or screen | `superpowers:brainstorming` |
| Planning multi-step changes | `superpowers:writing-plans` |
| Writing or fixing core logic | `superpowers:test-driven-development` |
| First sign of a bug or failure | `superpowers:systematic-debugging` |
| Anything touching the TV app, packaging or `sdb` | `samsung-tizen-app` |
| Working on UI / the website | `frontend-design:frontend-design` |
| Website copy, before it ships | `humanizer` (EN), `humanizer-da` (DA) |
| Before completing a feature branch | `superpowers:requesting-code-review` |
| Before claiming any task done | `superpowers:verification-before-completion` |
| After implementing — reviewing quality | `simplify` |

---

## The two rules that matter most here

### 1. The engine ceiling is law

The TV's Chromium is tied to its firmware and never updates. This app is authored
to **Chromium 69**, which also covers the Chromium 76 of Tizen 6.0.

Off limits in `js/`, `css/`, `index.html`: flex `gap` (needs 84), `clamp()/min()/max()`
(79), `inset` (87), `:is()/:where()` (88), `aspect-ratio` (88), `:focus-visible` (86),
`?.` and `??` (80), `replaceAll` (85), `Array.at` (92), `structuredClone` (98).

`npm run compat` enforces it and runs on every commit. **`npm run smoke` cannot
catch a violation** — it drives a modern Chromium that accepts all of the above.
A green test suite says nothing about compatibility.

`website/` is exempt (modern browsers) and is skipped by the lint.

Two non-version-gated traps, both already handled and commented in place:
- Every `#id` that sets its own `display` also needs `#id[hidden]{display:none !important}`.
  Id specificity beats the `[hidden]` attribute rule, so `.hidden = true` silently fails.
- Grid rows must be **explicit**. With `grid-auto-rows: auto`, Chromium 76 squishes
  rows to fit the container and the tiles collapse to a few pixels.

### 2. You are debugging blind

There is no DevTools on a retail set. On the reference TV (UE50AU8005KXXC),
`sdb shell` returns empty or `closed`, and `dlog`/`dlogutil` return nothing at all.
So:

- **Bump `BUILD` in `js/app.js` on every deploy.** A reinstall does not always
  reload the page; the on-screen stamp is the only proof of what is running.
- **The BLUE key** opens the diagnostics overlay: user agent, measured element
  sizes (the layout-collapse detector), API state, last error, focus position.
- Launch with `tizen run -p <app-id> -t <name>`, never `sdb shell 0 app_launcher`
  (which exits 0 having done nothing). `tizen -t` takes the **device name** from
  column 3 of `sdb devices`, not the `ip:port` from column 1.
- A `.wgt` filename containing a space fails to install with a silent, reasonless
  error. `build.sh` renames it.

---

## Architecture

```
index.html        one page; inline SVG icon sprite (no external images, no CORS)
config.xml        Tizen manifest: <access>, CSP, internet + tv.inputdevice privileges
css/app.css       theme variables, header, hero, stat grid
css/widgets.css   hourly strip, day cards, footer, overlays, focus ring
js/wmo.js         WMO code -> label + icon        ┐
js/units.js       unit conversion, date/time      │ shared with the website
js/api.js         Open-Meteo client + cache       ┘
js/nav.js         D-pad focus engine (logical row/col + scopes)
js/render.js      DOM rendering; registers focusables with Nav
js/app.js         bootstrap, key routing, refresh loop, diagnostics overlay
website/          GitHub Pages site (EN / DA / FA), modern-browser target
tools/            desktop only: compat lint, test suites, site assembly, OG render
tests/fixtures/   recorded API response — the suites run against this, not the network
```

**Layer rules**
- `js/wmo.js`, `js/units.js`, `js/api.js` are shared with the website. They must
  stay free of DOM and of anything TV-specific — `tools/build-site.mjs` copies them
  verbatim into the site. Anything TV-only belongs in `render.js`, `nav.js` or `app.js`.
- `nav.js` knows nothing about weather; `render.js` knows nothing about key codes.
- Focus moves by **logical (row, col)**, never pixel geometry. A chip scrolled under
  a header shares the header's viewport top, and geometry-based navigation then jumps
  to the wrong element.

---

## Coding conventions

- [ ] App code is plain `var`/`function` JavaScript, IIFE modules on `window`. No
      framework, no bundler, no transpiler — the whole point is that the `.wgt` is
      the source.
- [ ] Files stay under **200 lines**; extract a module when one grows past it.
- [ ] No hardcoded user-facing strings in the website JS — they go in
      `website/js/i18n/<lang>.js`.
- [ ] Comments say *why*. Several record engine bugs and will look like mistakes
      without the explanation.
- [ ] DRY / SOLID / KISS / YAGNI. Delete dead code immediately.
- [ ] TDD: add the assertion to `tools/smoke.mjs` or `tools/site-check.mjs` first.
      Both print a named failure per assertion, so a new check costs one line.
- [ ] Conventional Commits, enforced by the `commit-msg` hook.

---

## Commands

```bash
npm run check         # compat lint + TV app suite + site at 4 breakpoints (what CI runs)
npm run compat        # ceiling lint only, no browser
npm run smoke         # TV app suite -> shots/
npm run site-check    # site, all 3 languages x 4 widths -> shots/site/
npm run serve-site    # assemble and serve _site/ on :8080
npm run live-check    # both suites against the real API
./build.sh --install 192.168.0.201    # package, install and launch on the TV
```

---

## Starting a new session

1. Read this file.
2. Run `npm run check` to confirm the tree is green.
3. If touching the TV app, read the `samsung-tizen-app` skill's
   `references/chromium-compat.md` before writing CSS or JS.
4. If touching the website, run `frontend-design:frontend-design` before writing
   markup, and `humanizer` on any English copy before it ships.
