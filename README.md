# ui-evidence

[한국어 README](./README.ko.md)

`ui-evidence` is a local CLI for capturing `before` and `after` UI screenshots, building side-by-side comparisons, and generating a review page a human can scan quickly.

It is designed for agent-driven workflows, but the CLI stays the source of truth.

## What it does

- captures stable UI screens with Playwright
- compares `before` and `after` images
- writes a local `review/index.html`
- supports `main` or another git ref as the `before` baseline
- scaffolds Claude Code and Codex bootstrap files for a consumer repo

## Works with

- Codex CLI
- Claude Code
- any local web app with a stable route and wait target
- any repo where `before` can come from the current checkout, a running URL, or another git ref

## Supported project types

- single-package Next.js apps
- single-package Vite/React apps
- Storybook setups with a stable review route
- generic web apps that can be opened by URL and waited on with a stable selector
- JavaScript workspaces using `pnpm`, `yarn`, or `npm` workspaces where the review app lives under a declared workspace package such as `apps/*` or `packages/*`

Current limit:

- arbitrary nested apps without workspace metadata are not a discovery target yet

## Install

### For humans

Install from GitHub into the app repo you want to review:

```bash
pnpm add -D github:0xBrewing/ui-evidence
pnpm exec ui-evidence install --agent both --config ./ui-evidence.config.yaml
pnpm exec ui-evidence doctor --config ./ui-evidence.config.yaml
pnpm exec ui-evidence doctor --config ./ui-evidence.config.yaml --deep
```

Equivalent install commands:

```bash
npm install -D github:0xBrewing/ui-evidence
yarn add -D github:0xBrewing/ui-evidence
bun add -d github:0xBrewing/ui-evidence
```

If you want to work on `ui-evidence` itself:

```bash
git clone https://github.com/0xBrewing/ui-evidence.git
cd ui-evidence
pnpm install
pnpm test
```

### For LLM setup

If you are in Codex CLI or Claude Code, give the agent this prompt:

```text
Read https://raw.githubusercontent.com/0xBrewing/ui-evidence/main/docs/installation.md
and set up ui-evidence for this repository.
Keep the first setup minimal and ask only about unresolved route, wait target, auth, or baseline details.
```

If `ui-evidence` is already installed in the repo, this also works:

```text
Read node_modules/ui-evidence/docs/installation.md and set up ui-evidence for this repository.
```

## Quick start

Run one stage:

```bash
pnpm exec ui-evidence run --config ./ui-evidence.config.yaml --stage primary-flow
```

Compare the current branch against `main`:

```bash
pnpm exec ui-evidence run --config ./ui-evidence.config.yaml --stage primary-flow --before-ref main
```

Open:

```text
screenshots/ui-evidence/<stage-id>/review/index.html
```

## Use with Codex or Claude Code

`ui-evidence` works best when the agent uses the CLI instead of improvising browser steps.

The intended flow is:

1. install `ui-evidence`
2. run `ui-evidence install`
3. fix only unresolved config values
4. run `ui-evidence doctor`, then `ui-evidence doctor --deep` when you want an actual route and wait-target check
5. use `ui-evidence run` for later UI comparison requests

After setup, users can ask for UI comparison either explicitly or in plain language:

- `Use ui-evidence to compare the checkout modal against main`
- `Capture before and after screenshots for the login screen`

## Minimal config shape

```yaml
version: 1
project:
  name: my-app
  rootDir: .
capture:
  baseUrl: http://127.0.0.1:3000
  browser:
    headless: true
  viewports:
    - id: mobile-390
      device: iPhone 13
      viewport:
        width: 390
        height: 844
servers:
  after:
    command: pnpm dev
    baseUrl: http://127.0.0.1:3000
stages:
  - id: primary-flow
    title: Primary Flow
    defaultViewports:
      - mobile-390
    screens:
      - id: home
        label: Home
        path: /
        waitFor:
          testId: screen-home
```

## Output

Each stage writes:

```text
screenshots/ui-evidence/<stage-id>/
  before/
  after/
  comparison/
    pairs/
    overview/
  review/
    index.html
  notes.<lang>.md
  report.<lang>.md
  manifest.json
```

## Repository files worth reading

- [docs/installation.md](./docs/installation.md)
- [examples/generic-web/ui-evidence.config.yaml](./examples/generic-web/ui-evidence.config.yaml)
- [skills/ui-evidence/SKILL.md](./skills/ui-evidence/SKILL.md)

## Contributing

Issues and pull requests are welcome.

If you want to improve setup UX, agent bootstrap, or HTML review output, start with:

- [README.md](./README.md)
- [docs/installation.md](./docs/installation.md)
- [skills/ui-evidence/SKILL.md](./skills/ui-evidence/SKILL.md)

## License

[MIT](./LICENSE)
