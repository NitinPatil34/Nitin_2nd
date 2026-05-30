#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export LME_CDP_ENDPOINT="${LME_CDP_ENDPOINT:-http://127.0.0.1:9222}"
export LME_BOOTSTRAP_ONLY="true"
export LME_STORAGE_STATE="${LME_STORAGE_STATE:-$HOME/.lme/lme-storage-state.json}"

npm run fetch:lme
