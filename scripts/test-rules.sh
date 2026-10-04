#!/usr/bin/env bash
# Runs the Firestore rules tests against the local emulator (project demo-byt, never production).
# The emulator needs Java 21+; a repo-local JDK in .tools/ is used when present.
set -euo pipefail
cd "$(dirname "$0")/.."

local_jdk=$(ls -d .tools/jdk-21*/Contents/Home 2>/dev/null | head -1 || true)
if [ -n "$local_jdk" ]; then
  export JAVA_HOME="$PWD/$local_jdk"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

exec npx firebase emulators:exec --only firestore --project demo-byt "npx vitest run --config vitest.rules.config.ts"
