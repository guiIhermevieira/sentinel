#!/usr/bin/env bash
set -euo pipefail

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
echo "Applying rulesets to $repo"

gh repo edit "$repo" \
  --enable-squash-merge \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --delete-branch-on-merge

for file in .github/rulesets/*.json; do
  name=$(node -p "require('./$file').name")
  id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
  if [ -n "$id" ]; then
    gh api --method PUT "repos/$repo/rulesets/$id" --input "$file" > /dev/null
    echo "  updated: $name"
  else
    gh api --method POST "repos/$repo/rulesets" --input "$file" > /dev/null
    echo "  created: $name"
  fi
done
