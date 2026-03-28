# ui-evidence installation.md

This file is meant to be handed to an LLM.

Prefer the installed `ui-evidence` skill if it is already available through `skills add`.
The skill is the agent-facing install surface. The package is the repo-local CLI that executes captures.
This repo keeps its canonical skill source under `agent-skill/ui-evidence/`. Consumer repos should only keep the generated repo-local installs in `.agents/skills/ui-evidence/` or `.claude/skills/ui-evidence/`.

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
pnpm exec ui-evidence install --agent both --config ./ui-evidence/config.yaml
npx ui-evidence install --agent both --config ./ui-evidence/config.yaml
yarn ui-evidence install --agent both --config ./ui-evidence/config.yaml
bunx ui-evidence install --agent both --config ./ui-evidence/config.yaml
```

If generated skill/docs copies drift from the package source later, resync them with `ui-evidence install --sync`.

This bootstrap should leave agent-recognized local skill copies in:

- `.agents/skills/ui-evidence/` for Codex and other `.agents` clients
- `.claude/skills/ui-evidence/` for Claude Code

5. Read `ui-evidence/installation.md` if it was generated.
6. Run the matching package-runner form of:

```bash
ui-evidence doctor --config ./ui-evidence/config.yaml
ui-evidence doctor --config ./ui-evidence/config.yaml --ready
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
- Persist config in `ui-evidence/config.yaml`.
- Create hooks only when route + wait target cannot reach the desired state.
- Keep the first setup minimal. One stage and one stable screen is enough.

## After setup

Use the matching package-runner form of:

```bash
ui-evidence run --config ./ui-evidence/config.yaml --stage <stage-id>
ui-evidence run --config ./ui-evidence/config.yaml --stage <stage-id> --before-ref main
ui-evidence run --config ./ui-evidence/config.yaml --stage <stage-id> --after-attach http://127.0.0.1:3000 --resume
ui-evidence snapshot --config ./ui-evidence/config.yaml --scope <scope-id>
ui-evidence snapshot --config ./ui-evidence/config.yaml --stage <stage-id> --profile mobile-en
ui-evidence run --config ./ui-evidence/config.yaml --stage <stage-id> --params locale=ko,variant=core
```

`ui-evidence review --stage <stage-id>` prefers stage comparison artifacts when they exist. If the stage has no before/after assets yet, it falls back to the latest snapshot `current` captures for that stage. If neither source exists, the command fails instead of writing an empty review. When snapshot fallback is used, ui-evidence materializes those images into the stage folder so the stage bundle stays portable by itself.

The canonical runtime layout is:

```text
ui-evidence/screenshots/   # human-facing artifacts
ui-evidence/state/         # durable capture/shared/fixture state
ui-evidence/tmp/           # temporary run and baseline worktrees
```

Return:

- `review/index.html`
- `report.<lang>.md`
- `manifest.json`
- important pair and overview images, or current snapshot captures and overview images

Open `review/index.html` directly from disk. A local web server is not required.
