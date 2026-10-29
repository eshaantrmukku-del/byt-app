#!/usr/bin/env bash
set -euo pipefail

REPO="eshaantrmukku-del/byt-website"
# The site's public address. ./set-domain.sh rewrites this when a custom domain is added.
SITE_URL="https://eshaantrmukku-del.github.io/byt-website/"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# A custom domain is used once website/CNAME exists (created by set-domain.sh).
DOMAIN=""
[[ -f "$SCRIPT_DIR/CNAME" ]] && DOMAIN="$(tr -d '[:space:]' < "$SCRIPT_DIR/CNAME")"
WORKDIR=$(mktemp -d)

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "→ Preparing site in $WORKDIR"
rsync -a --exclude README.md --exclude '*.sh' --exclude '.DS_Store' "$SCRIPT_DIR/" "$WORKDIR/"

cd "$WORKDIR"
git init -q -b main
git add .
git -c user.email="website@byt.app" -c user.name="BYT" commit -q -m "Update BYT marketing site"

gh auth setup-git 2>/dev/null || true

if gh repo view "$REPO" &>/dev/null; then
  git remote add origin "https://github.com/$REPO.git"
  git push -u origin main --force
else
  gh repo create byt-website --public --source=. --remote=origin --push \
    --description "BYT (Build Your Tomorrow) — marketing website"
fi

if [[ -n "$DOMAIN" ]]; then
  PAGES_JSON=$(printf '{"build_type":"legacy","source":{"branch":"main","path":"/"},"cname":"%s"}' "$DOMAIN")
else
  PAGES_JSON='{"build_type":"legacy","source":{"branch":"main","path":"/"}}'
fi
gh api -X POST "repos/$REPO/pages" --input - <<<"$PAGES_JSON" 2>/dev/null || \
gh api -X PUT "repos/$REPO/pages" --input - <<<"$PAGES_JSON" 2>/dev/null || true
# HTTPS is offered once GitHub has issued the certificate for the domain (can take up to an hour).
[[ -n "$DOMAIN" ]] && gh api -X PUT "repos/$REPO/pages" -F https_enforced=true >/dev/null 2>&1 || true

echo ""
echo "✓ Deployed to $SITE_URL"
if [[ -n "$DOMAIN" ]]; then
  APEX="${DOMAIN#www.}"
  echo ""
  echo "DNS records to add at your registrar for $APEX:"
  echo "  A     @    185.199.108.153"
  echo "  A     @    185.199.109.153"
  echo "  A     @    185.199.110.153"
  echo "  A     @    185.199.111.153"
  echo "  CNAME www  eshaantrmukku-del.github.io"
  echo "Then rerun this script once DNS has updated, to switch on HTTPS."
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

echo "Site pushed — GitHub Pages may still be building (or DNS is still updating)."
echo "Check: $SITE_URL"
