#!/usr/bin/env bash
set -euo pipefail

OWNER="${OWNER:-Chxmdi}"
REPO="${REPO:-Ojoro_App}"
PROJECT_TITLE="${PROJECT_TITLE:-OJORO Product Roadmap}"
FULL_REPO="$OWNER/$REPO"

command -v gh >/dev/null || { echo "ERROR: GitHub CLI (gh) is required."; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq is required."; exit 1; }

gh auth status >/dev/null
gh auth refresh -s project >/dev/null || true

echo "Creating labels..."
jq -c '.[]' project/labels.json | while read -r row; do
  name=$(echo "$row" | jq -r '.name')
  color=$(echo "$row" | jq -r '.color')
  desc=$(echo "$row" | jq -r '.description')
  gh label create "$name" -R "$FULL_REPO" --color "$color" --description "$desc" --force
done

echo "Creating milestones..."
jq -c '.[]' project/milestones.json | while read -r row; do
  title=$(echo "$row" | jq -r '.title')
  existing=$(gh api "repos/$FULL_REPO/milestones?state=all&per_page=100" --jq ".[] | select(.title == \"$title\") | .number" | head -n 1 || true)
  if [ -z "$existing" ]; then
    gh api -X POST "repos/$FULL_REPO/milestones" -f title="$title" >/dev/null
  fi
done

echo "Creating GitHub Project..."
PROJECT_NUMBER=$(gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title == \"$PROJECT_TITLE\") | .number" | head -n1 || true)
if [ -z "$PROJECT_NUMBER" ]; then
  PROJECT_NUMBER=$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq '.number')
fi

gh project edit "$PROJECT_NUMBER" --owner "$OWNER"   --description "Ojoro product roadmap: 12 milestones, 16 epics, 64 stories and 256 implementation tasks."   --visibility PRIVATE >/dev/null || true

gh project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$FULL_REPO" >/dev/null || true

echo "Project setup complete: $PROJECT_TITLE"
echo "Issues are created by the connected GitHub integration; add them to the project from GitHub UI or with gh project item-add."
