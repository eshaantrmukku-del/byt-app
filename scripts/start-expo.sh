#!/usr/bin/env bash
# Starts the Expo dev server, refusing to run if .env contains provider secrets.
# In development Expo bundles the .env file itself (for env hot reload), so every
# EXPO_PUBLIC_* line in it reaches any device or tunnel visitor that loads the app.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/check-env.cjs --strict
exec npx expo start "$@"
