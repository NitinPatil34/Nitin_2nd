#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="${LME_BOOTSTRAP_PROFILE_DIR:-$HOME/.lme/manual-chrome-profile}"
DEBUG_PORT="${LME_DEBUG_PORT:-9222}"
CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -x "$CHROME_APP" ]]; then
  echo "Google Chrome was not found at $CHROME_APP" >&2
  echo "Install Chrome from https://www.google.com/chrome/ and rerun this script." >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"

"$CHROME_APP" \
  --remote-debugging-port="$DEBUG_PORT" \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "https://www.lme.com/account/login" >/tmp/lme-debug-chrome.log 2>&1 &

cat <<EOF
Chrome launched with remote debugging.

1. In that Chrome window, open/login to:
   https://www.lme.com/account/login
2. Leave Chrome open.
3. In another Terminal tab from this repo, run:
   LME_CDP_ENDPOINT=http://127.0.0.1:$DEBUG_PORT LME_BOOTSTRAP_ONLY=true npm run fetch:lme

Profile: $PROFILE_DIR
Debug endpoint: http://127.0.0.1:$DEBUG_PORT
EOF
