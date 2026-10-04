#!/usr/bin/env bash
set -euo pipefail

REPO="eshaantrmukku-del/byt-website"
# Primary public URL (GitHub Pages). Custom domain is optional until DNS is connected.
SITE_URL="https://eshaantrmukku-del.github.io/byt-website/"
# Optional custom domain — leave empty or set DOMAIN and keep website/CNAME in sync when ready.
DOMAIN="${DOMAIN:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKDIR=$(mktemp -d)

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "→ Preparing site in $WORKDIR"
cp "$SCRIPT_DIR/index.html" "$WORKDIR/"
# CNAME is optional; only include if present and DOMAIN is set
if [[ -n "$DOMAIN" && -f "$SCRIPT_DIR/CNAME" ]]; then
  cp "$SCRIPT_DIR/CNAME" "$WORKDIR/"
  echo "  including CNAME for $DOMAIN (optional custom domain)"
fi
cp -r "$SCRIPT_DIR/assets" "$WORKDIR/"
mkdir -p "$WORKDIR/privacy" "$WORKDIR/delete-account"
cp "$SCRIPT_DIR/privacy/index.html" "$WORKDIR/privacy/"
cp "$SCRIPT_DIR/delete-account/index.html" "$WORKDIR/delete-account/"

cd "$WORKDIR"
git init -b main
git add .
git -c user.email="website@byt.app" -c user.name="BYT" commit -m "Update BYT marketing site"

gh auth setup-git 2>/dev/null || true

if gh repo view "$REPO" &>/dev/null; then
  git remote add origin "https://github.com/$REPO.git"
  git push -u origin main --force
else
  gh repo create byt-website --public --source=. --remote=origin --push \
    --description "BYT (Build Your Tomorrow) — marketing website"
fi

# Enable GitHub Pages from main (no custom domain required)
if [[ -n "$DOMAIN" ]]; then
  PAGES_JSON=$(printf '{"build_type":"legacy","source":{"branch":"main","path":"/"},"cname":"%s"}' "$DOMAIN")
else
  PAGES_JSON='{"build_type":"legacy","source":{"branch":"main","path":"/"}}'
fi
gh api -X POST "repos/$REPO/pages" --input - <<<"$PAGES_JSON" 2>/dev/null || \
gh api -X PUT "repos/$REPO/pages" --input - <<<"$PAGES_JSON" 2>/dev/null || true

echo ""
echo "✓ Deployed to $SITE_URL"
if [[ -n "$DOMAIN" ]]; then
  echo "  (optional custom domain: https://${DOMAIN}/ — requires DNS)"
fi

for i in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL" || echo "000")
  echo "  check $i: HTTP $code"
  if [ "$code" = "200" ]; then
    echo ""
    echo "Live: $SITE_URL"
    exit 0
  fi
  sleep 5
done

echo "Site pushed — GitHub Pages may still be building."
echo "Check: $SITE_URL"
