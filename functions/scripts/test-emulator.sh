#!/usr/bin/env bash
# Credit, auth and idempotency tests against the local Firestore emulator.
# Never touches ascend-9d17e. Requires Java 21+.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -x .tools/jdk-21*/bin/java ] || ls -d .tools/jdk-21* >/dev/null 2>&1; then
  local_jdk=$(ls -d .tools/jdk-21* 2>/dev/null | head -1 || true)
  if [ -n "$local_jdk" ]; then
    if [ -d "$local_jdk/Contents/Home" ]; then local_jdk="$local_jdk/Contents/Home"; fi
    export JAVA_HOME="$PWD/$local_jdk"
    export PATH="$JAVA_HOME/bin:$PATH"
  fi
fi

FIREBASE="node_modules/.bin/firebase"
if [ ! -x "$FIREBASE" ]; then FIREBASE="npx --no-install firebase"; fi
# firebase.json lives at the repo root; the CLI must run from there.
exec $FIREBASE emulators:exec --only firestore --project demo-byt \
  "npm --prefix functions run test:emulator:vitest"
