# Repository Delivery Status

This repository is the implementation home for the Ojoro v2.0 PRD.

## Installed in the repository

- Monorepo foundation for mobile, web, API and shared packages
- CI workflow
- CodeQL security workflow
- Dependency Review workflow
- Pull-request labeler
- Conventional Commit PR-title validation
- Release workflow
- Manual staging smoke workflow
- Dependabot
- CODEOWNERS
- Pull-request template
- Epic, Story and Bug issue forms
- Security and contribution policies
- 16 epic issues
- 64 implementation story issues
- 256 engineering tasks embedded as story checklists
- Project, milestone and label manifests
- GitHub administration bootstrap/verification scripts

## Issue hierarchy

Epics are issues #2–#17.

Stories are issues #18–#81.

Each story contains four work layers:
1. domain/schema/contracts;
2. backend/domain implementation;
3. client experience;
4. testing, observability, security/privacy and release evidence.

## Administration still requiring GitHub Project / repository-admin APIs

The connected GitHub integration used from ChatGPT can edit repository files and issues, but it does not expose mutations for every repository-administration feature. Use `scripts/bootstrap-github.sh` to ensure the following native GitHub configuration exists:

- custom labels from `project/labels.json`
- 12 milestones from `project/milestones.json`
- the **OJORO Product Roadmap** GitHub Project
- Project fields for Phase, Priority and Epic
- Project linkage to this repository

Then configure the recommended `main` ruleset described in `docs/GITHUB_SETUP.md`.

## Recommended next build item

Start with **#2 E01 — Platform Foundation**, then complete stories **#18–#21** before progressing to Identity.
