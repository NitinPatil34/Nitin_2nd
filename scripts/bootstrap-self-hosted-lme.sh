#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export LME_STORAGE_STATE="${LME_STORAGE_STATE:-$HOME/.lme/lme-storage-state.json}"
export LME_HEADLESS="${LME_HEADLESS:-false}"
export LME_BROWSER_CHANNEL="${LME_BROWSER_CHANNEL:-chrome}"
export LME_BOOTSTRAP_PROFILE_DIR="${LME_BOOTSTRAP_PROFILE_DIR:-$HOME/.lme/chrome-bootstrap-profile}"

printf 'Installing dependencies...\n'
npm ci
printf 'Installing Playwright Chromium...\n'
npx playwright install chromium
printf 'Opening LME bootstrap browser in installed Google Chrome. Complete Cloudflare and login, then press Enter in this terminal.\n'
npm run bootstrap:lme
