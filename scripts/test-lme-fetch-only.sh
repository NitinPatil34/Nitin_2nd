#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export LME_STORAGE_STATE="${LME_STORAGE_STATE:-$HOME/.lme/lme-storage-state.json}"
export LME_FETCH_ONLY="true"
export LME_SESSION_ONLY="true"

npm run fetch:lme
