#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Checking Expo login..."
if ! npx eas-cli whoami >/dev/null 2>&1; then
  echo ""
  echo "Not logged in to Expo. Run this first (opens browser):"
  echo "  npx eas-cli login"
  echo ""
  exit 1
fi

echo "==> Starting Android APK build on Expo servers..."
echo "    (first build may take 10–20 minutes)"
echo ""

npx eas-cli build --platform android --profile preview "$@"

echo ""
echo "When the build finishes, download the APK:"
echo "  npx eas-cli build:list --platform android --limit 1"
echo "  npx eas-cli build:download --platform android --latest"
echo ""
echo "Or open https://expo.dev → your project → Builds"
