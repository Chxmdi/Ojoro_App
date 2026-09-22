#!/usr/bin/env bash
set -euo pipefail
OWNER="${OWNER:-Chxmdi}"
REPO="${REPO:-Ojoro_App}"
FULL="$OWNER/$REPO"

echo "Repository:"
gh repo view "$FULL" --json nameWithOwner,url,visibility,defaultBranchRef

echo "Issue count:"
gh issue list -R "$FULL" --state all --limit 500 --json number | jq 'length'

echo "Workflows:"
gh api "repos/$FULL/actions/workflows" --jq '.workflows[] | [.name,.state] | @tsv'

echo "Labels:"
gh label list -R "$FULL" --limit 100

echo "Milestones:"
gh api "repos/$FULL/milestones?state=all&per_page=100" --jq '.[] | [.number,.title,.state] | @tsv'
