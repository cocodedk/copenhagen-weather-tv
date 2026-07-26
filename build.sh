#!/usr/bin/env bash
# Package (and optionally sideload) the Tizen .wgt.
#
#   ./build.sh                     # lint + package -> dist/CopenhagenWeather.wgt
#   ./build.sh --test              # also run the desktop Chrome smoke test first
#   ./build.sh --install 192.168.1.50   # package, then install + launch on that TV
#
# Env: TIZEN_PROFILE (signing profile name), TIZEN_STUDIO (SDK root).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIZEN_STUDIO="${TIZEN_STUDIO:-$HOME/tizen-studio}"
TIZEN_PROFILE="${TIZEN_PROFILE:-BabakTV}"
APP_ID="WxCph00001.CopenhagenWeather"
WGT="CopenhagenWeather.wgt"
export PATH="$TIZEN_STUDIO/tools/ide/bin:$TIZEN_STUDIO/tools:$PATH"

RUN_TEST=0
TV_IP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --test) RUN_TEST=1; shift ;;
    --install) TV_IP="${2:?--install needs a TV IP}"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

cd "$ROOT"

echo "==> Chromium-ceiling lint"
node tools/compat-lint.mjs

if [[ $RUN_TEST == 1 ]]; then
  echo "==> desktop smoke test"
  node tools/smoke.mjs
fi

# Stage ONLY what the TV needs. Packaging the whole folder would drag tools/,
# shots/ and any node_modules into the .wgt.
echo "==> staging"
rm -rf dist && mkdir -p dist
cp config.xml index.html icon.png dist/
cp -r css js dist/
# stale signatures from an earlier run must never be repackaged
rm -f dist/author-signature.xml dist/signature*.xml dist/*.wgt

echo "==> packaging (profile: $TIZEN_PROFILE)"
cd dist
tizen package -t wgt -s "$TIZEN_PROFILE" -- . >/dev/null
# tizen names the archive after <name> in config.xml, which contains a space
if [[ -f "Copenhagen Weather.wgt" ]]; then mv "Copenhagen Weather.wgt" "$WGT"; fi
cd "$ROOT"
ls -l "dist/$WGT"

if [[ -n "$TV_IP" ]]; then
  echo "==> connecting to $TV_IP"
  sdb connect "$TV_IP:26101" >/dev/null || true
  LINE="$(sdb devices | awk -v ip="$TV_IP:" 'index($1, ip)==1 {print; exit}')"
  [[ -n "$LINE" ]] || { echo "ERROR: $TV_IP:26101 not listed by 'sdb devices' — is Developer Mode on and this host's IP registered?" >&2; exit 1; }
  [[ "$(awk '{print $2}' <<<"$LINE")" == "device" ]] || { echo "ERROR: device state is '$(awk '{print $2}' <<<"$LINE")', expected 'device'" >&2; exit 1; }
  # Column 3 is the DEVICE NAME (e.g. UE50AU8005KXXC). `tizen -t` wants that name,
  # NOT the ip:port from column 1 — passing the address fails with
  # "There is no <ip>:26101 target."
  TARGET="$(awk '{print $3}' <<<"$LINE")"
  echo "    target: $TARGET"

  echo "==> installing"
  # cd in and pass a BARE filename: an absolute -n path, or any .wgt name
  # containing a space, fails with a silent reasonless install error.
  ( cd "$ROOT/dist" && tizen install -n "$WGT" -t "$TARGET" -- . )

  echo "==> launching"
  # `tizen run` — NOT `sdb shell 0 app_launcher`. sdb shell returns empty
  # ("closed") on retail TVs, so app_launcher exits 0 having done nothing.
  tizen run -p "$APP_ID" -t "$TARGET"
  echo
  echo "sdb shell and dlog are both silent on this retail set — to inspect state,"
  echo "press BLUE on the remote for the on-screen diagnostics overlay, and check"
  echo "the build stamp bottom-right matches BUILD in js/app.js."
fi
