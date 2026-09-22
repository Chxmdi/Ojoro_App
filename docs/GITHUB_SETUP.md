# GitHub Setup

This repository is designed around the Ojoro v2.0 PRD.

## Repository management
The connected ChatGPT GitHub integration can create files and issues. Some repository-administration operations—GitHub Projects, labels, milestones, rulesets and branch protection—may require GitHub CLI or the GitHub UI.

Use `scripts/bootstrap-github.sh` for the remaining administration steps when needed.

## Recommended main ruleset
- require a pull request before merge
- minimum 1 approval
- CODEOWNERS review for sensitive paths
- dismiss stale approvals
- require conversation resolution
- require CI / security checks
- block force pushes
- block branch deletion
- squash merge preferred
