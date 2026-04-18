#!/usr/bin/env bash
# Sync from vault, commit, and push. GitHub Actions handles the actual deploy.
# Usage:
#   pnpm deploy                         # auto-generated message
#   pnpm deploy "blog: SOTIF 입문"      # custom commit message

set -e

pnpm sync

git add -A

if git diff --cached --quiet; then
  echo "→ no changes to commit, skipping push"
  exit 0
fi

msg="${1:-update $(date +%Y-%m-%d-%H%M)}"
git commit -m "$msg"
git push

echo ""
echo "→ pushed. GitHub Actions will build and deploy shortly."
echo "  Watch:  gh run watch"
echo "  Site:   https://minsoo-shin.github.io/"
