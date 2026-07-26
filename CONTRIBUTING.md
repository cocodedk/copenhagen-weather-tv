# Contributing to Copenhagen Weather

## Local setup

```bash
git clone https://github.com/cocodedk/copenhagen-weather-tv
cd copenhagen-weather-tv
npm install
npx playwright install chromium     # the test suite drives a real browser
./scripts/install-hooks.sh          # pre-commit, commit-msg, pre-push
```

`core.hooksPath` is per-checkout and is not committed, so a fresh clone has no
hooks until you run the installer. Please do run it.

To put the app on a TV you also need Tizen Studio's CLI tools (`tizen`, `sdb`) and
a signing profile. See "Put it on your TV" in the [README](README.md).

## Commands

```bash
npm run check        # everything CI runs: compat lint, TV app suite, site at 4 breakpoints
npm run compat       # Chromium-ceiling lint only (fast, no browser)
npm run smoke        # TV app suite -> shots/
npm run serve-site   # assemble _site/ and serve it on :8080
npm run live-check   # same suites, but against the real Open-Meteo API
npm run og           # re-render website/og.png
./build.sh --install <tv-ip>   # package, install and launch on a TV
```

## Two rules that are easy to break

**1. The app targets Chromium 69.** The TV's browser engine is frozen to its
firmware and will never update. `npm run compat` enforces this, and it is the one
check that runs on every commit. If it rejects something you need, look for the
workaround in the README's engine-ceiling section rather than raising the ceiling.

The website (`website/`) is exempt: it runs in modern browsers and may use
`:focus-visible`, `clamp()` and so on.

**2. Bump `BUILD` in `js/app.js` on every deploy to a TV.** A reinstall does not
always reload the page, and the on-screen build stamp is the only way to tell
whether the set is running your new code. There is no usable device log on a
retail TV.

## Testing

The suites run against `tests/fixtures/forecast.json` by default, so they are
deterministic and work offline. Use `npm run live-check` by hand when the API
contract may have changed; if the fixture needs re-recording, note that some
assertions are derived from it and will follow automatically.

What the suites cannot cover: real remote-control behaviour and the actual
install. Verify those on a TV.

## Style

- Files stay under 200 lines. Extract a module when one grows past it.
- App code (`js/`, `css/`) is plain ES5-flavoured JavaScript with `var` and
  functions, for the old engine's sake. No build step, no bundler.
- Comments explain *why*, especially where a workaround looks odd. Several
  comments in the CSS record engine bugs that will look like mistakes otherwise.
- Conventional Commits, enforced by the `commit-msg` hook:
  `feat:`, `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `ci:`,
  `build:`, `perf:`, `revert:`.

## Branches

Never commit to `main` directly. Branch names are kebab-case with a prefix
matching the commit type: `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `ci/`.

Recommended local git config:

```bash
git config pull.rebase true
git config core.autocrlf input      # 'true' on Windows
git config push.autoSetupRemote true
```

## PR checklist

- [ ] `npm run check` passes
- [ ] App changes verified on a real TV, with the build stamp bumped
- [ ] Site changes checked at 360px and 1280px, and in Persian RTL
- [ ] Docs updated if behaviour changed
