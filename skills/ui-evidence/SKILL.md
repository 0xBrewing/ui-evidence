---
name: ui-evidence
description: Use when an LLM needs to discover, configure, or run before/after UI screenshot capture, local HTML review generation, or git-baseline UI evidence workflows for a web app.
---

# UI Evidence

Use this skill when the user wants an agent to:

- capture `before` and `after` UI screenshots
- compare two UI states locally
- generate a review page a human can scan quickly
- persist a reusable config for future UI work
- compare the current checkout against another git ref

This skill is intentionally thin. The CLI is the engine.

## Default flow

1. Run `ui-evidence discover`.
2. Read the suggested config and unresolved list.
3. Ask only about unresolved values.
4. Create or patch `ui-evidence.config.yaml`.
5. Add `ui-evidence/hooks/*` only if deterministic state is needed.
6. Run `ui-evidence doctor`.
7. Run `ui-evidence run` or `capture/compare/report/review`.
8. Summarize:
   - `review/index.html`
   - `report.<lang>.md`
   - `manifest.json`
   - pair and overview images

## Commands to prefer

```bash
ui-evidence discover --format json
ui-evidence init --interactive --config ./ui-evidence.config.yaml
ui-evidence doctor --config ./ui-evidence.config.yaml
ui-evidence run --config ./ui-evidence.config.yaml --stage <stage-id>
ui-evidence run --config ./ui-evidence.config.yaml --stage <stage-id> --before-ref main
ui-evidence review --config ./ui-evidence.config.yaml --stage <stage-id>
```

## What to inspect locally first

- package manager and dev scripts
- Playwright config and existing auth states
- harness routes or storybook routes
- stable `data-testid` targets
- existing screenshot folders
- whether the repo can boot from another git ref

## Rules

- Keep stage definitions stable and additive.
- Prefer existing harness routes over fragile live flows.
- Prefer `testId` waits over loose selectors.
- Treat `review/index.html` as the default human-facing artifact.
- Keep hooks small and deterministic.
- Do not re-implement browser automation in prompt text.
