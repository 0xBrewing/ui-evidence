# ui-evidence installation.md

This file is meant to be handed to an LLM.

Prefer the installed `ui-evidence` skill if it is already available through `skills add`.

If a user says "read this file and set up ui-evidence for this repo", follow the steps below and keep the setup small.

## Goal

Enable future requests like:

- `compare this UI before and after`
- `compare this branch against main`
- `use ui-evidence for the checkout modal`

## Best fit repositories

- single-package Next.js or Vite apps
- Storybook projects with a stable review route
- JavaScript workspaces declared through `pnpm`, `yarn`, or `npm` workspaces

Current limit:

- non-workspace nested apps may still need manual correction after discovery

## Setup

1. Detect the package manager for the current repository.
2. Check whether the repo can already run `ui-evidence`.
3. If the CLI is missing, install `ui-evidence` as a dev dependency from GitHub.

Use one of:

```bash
pnpm add -D github:0xBrewing/ui-evidence
npm install -D github:0xBrewing/ui-evidence
yarn add -D github:0xBrewing/ui-evidence
bun add -d github:0xBrewing/ui-evidence
```

4. Run the repo-local bootstrap step:

```bash
pnpm exec ui-evidence install --agent both --config ./ui-evidence.config.yaml
npx ui-evidence install --agent both --config ./ui-evidence.config.yaml
yarn ui-evidence install --agent both --config ./ui-evidence.config.yaml
bunx ui-evidence install --agent both --config ./ui-evidence.config.yaml
```

This bootstrap should leave agent-recognized local skill copies in:

- `.agents/skills/ui-evidence/` for Codex and other `.agents` clients
- `.claude/skills/ui-evidence/` for Claude Code

5. Read `docs/ui-evidence-installation.md` if it was generated.
6. Run the matching package-runner form of:

```bash
ui-evidence doctor --config ./ui-evidence.config.yaml
ui-evidence doctor --config ./ui-evidence.config.yaml --deep
```

Use the native package runner when needed:

- `pnpm exec`
- `npx`
- `yarn`
- `bunx`

7. If discovery or doctor still leaves open items, ask only about:

- the first route to capture
- a stable wait target
- auth state if required
- the baseline ref if the user wants branch comparison

## Rules

- Prefer the installed `ui-evidence` skill over ad hoc browser steps.
- Persist config in `ui-evidence.config.yaml`.
- Create hooks only when route + wait target cannot reach the desired state.
- Keep the first setup minimal. One stage and one stable screen is enough.

## After setup

Use the matching package-runner form of:

```bash
ui-evidence run --config ./ui-evidence.config.yaml --stage <stage-id>
ui-evidence run --config ./ui-evidence.config.yaml --stage <stage-id> --before-ref main
ui-evidence snapshot --config ./ui-evidence.config.yaml --scope <scope-id>
```

Return:

- `review/index.html`
- `report.<lang>.md`
- `manifest.json`
- important pair and overview images, or current snapshot captures and overview images
