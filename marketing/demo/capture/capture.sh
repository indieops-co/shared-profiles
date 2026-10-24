#!/usr/bin/env bash
# Rebuilds the demo's source material from the product as it is now: a throwaway library (never ~/.indieops),
# the real init / import / set / build output, and the browser shots of the real brand/preview.html.
#   bash capture/capture.sh [path/to/shared-profiles]   (default: the repo this folder is in)
# Compare the printed output with PICK and TUNE in src/Demo.tsx, and update them if anything changed.
# The shots and their crop rectangles go to public/shots/ (shots.json).
set -euo pipefail
cd "$(dirname "$0")/.."
SKILL="$(cd "${1:-../..}" && pwd)"
WORK="$(mktemp -d)"
export INDIEOPS_HOME="$WORK/library"
# The design catalogue as the tests pin it. Its Stripe DESIGN.md gives the same output as the live
# awesome-design-md (checked 2026-10-24); only the commit shown on the "from" line differs, and the GIF doesn't show it.
export IOC_THEME_SOURCE_DIR="$SKILL/test/fixtures/source"
ioc() { printf '\n$ node scripts/ioc.mjs'; printf ' %q' "$@"; printf '\n'; node "$SKILL/scripts/ioc.mjs" "$@"; }

ioc init --business "Acme Plumbing & Heating"
ioc theme import stripe --business "Acme Plumbing & Heating"
ioc theme set --business acme-plumbing-heating accent "#0a7c66" fonts.display Fraunces
ioc theme build --business acme-plumbing-heating

node capture/shots.mjs "$INDIEOPS_HOME/businesses/acme-plumbing-heating/brand/preview.html" public/shots
echo "Shots → public/shots/. Library: $INDIEOPS_HOME"
