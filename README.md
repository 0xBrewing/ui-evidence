# ui-evidence

[한국어 README](./README.ko.md)

`ui-evidence` is a skill-first local CLI for capturing `before` and `after` UI screenshots, building side-by-side comparisons, and generating a review page a human can scan quickly.

The CLI is the deterministic engine. The skill is the first-class install surface for Codex, Claude Code, and the wider agent-skills ecosystem.

## What it does

- captures stable UI screens with Playwright
- compares `before` and `after` images
- writes a local `review/index.html`
- supports `main` or another git ref as the `before` baseline
- scaffolds repo-local bootstrap files after the skill or package is installed

## Works with

- the open agent skills ecosystem through `SKILL.md`
- Codex, Claude Code, and other clients that support `skills add`
- local web apps with a stable route and wait target
- repos where `before` can come from the current checkout, a running URL, or another git ref

## Supported project types

- single-package Next.js apps
- single-package Vite/React apps
- Storybook setups with a stable review route
- generic web apps that can be opened by URL and waited on with a stable selector
- JavaScript workspaces using `pnpm`, `yarn`, or `npm` workspaces where the review app lives under a declared workspace package such as `apps/*` or `packages/*`

Current limit:

- arbitrary nested apps without workspace metadata are not a discovery target yet

## Install

### Skill-first install

Install the skill with the ecosystem-native installer:

```bash
pnpm dlx skills add 0xBrewing/ui-evidence
pnpm dlx skills add 0xBrewing/ui-evidence -a codex
pnpm dlx skills add 0xBrewing/ui-evidence -a claude-code
pnpm dlx skills add 0xBrewing/ui-evidence -g -a codex
```

Interactive install lets the user choose the target agent, project or global scope, and symlink or copy mode.

Equivalent `npx skills add ...` commands work too.

By convention, the skill lands in:

- `.agents/skills/` for Codex and other `.agents` clients
- `.claude/skills/` for Claude Code

After the skill is installed, ask the agent to use it. On first use, the skill installs the `ui-evidence` package into the current repo and runs the repo bootstrap step automatically.

That bootstrap aligns with agent-native paths too. It writes repo-local skill copies to `.agents/skills/ui-evidence/` for Codex and `.claude/skills/ui-evidence/` for Claude Code, so `skills add` installs and `installation.md` bootstrap converge on recognized locations.

### First prompt after installing the skill

```text
Use ui-evidence to compare the checkout modal against main.
```

or:

```text
Bootstrap ui-evidence for this repo and keep the first setup minimal.
```

### Direct CLI install

If you want the package without using `skills add`, install it from GitHub:

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

This direct CLI path still bootstraps the same agent-native local skill locations: `.agents/skills/ui-evidence/` and `.claude/skills/ui-evidence/`.

### For LLM setup

If you want to hand an installation playbook to an LLM directly:

```text
Read https://raw.githubusercontent.com/0xBrewing/ui-evidence/main/docs/installation.md
and set up ui-evidence for this repository.
Prefer the installed ui-evidence skill if it is already available.
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

The intended flow is:

1. install the skill with `skills add`
2. ask the agent to use `ui-evidence`
3. let the skill install the CLI package and run `ui-evidence install`
4. fix only unresolved config values
5. run `ui-evidence doctor`, then `ui-evidence doctor --deep` when you want an actual route and wait-target check
6. use `ui-evidence run` for later UI comparison requests

After bootstrap, users can ask for UI comparison either explicitly or in plain language:

- `Use ui-evidence to compare the checkout modal against main`
- `Capture before and after screenshots for the login screen`

## Open skill bundle

This repo ships the standard pieces expected by the open skills ecosystem:

- [`skills/ui-evidence/SKILL.md`](./skills/ui-evidence/SKILL.md)
- [`skills/ui-evidence/agents/openai.yaml`](./skills/ui-evidence/agents/openai.yaml)
- [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)

The Claude plugin mirror under [`plugins/ui-evidence/`](./plugins/ui-evidence) is generated from the canonical skill source.

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

If you want to improve setup UX, skill metadata, or HTML review output, start with:

- [README.md](./README.md)
- [docs/installation.md](./docs/installation.md)
- [skills/ui-evidence/SKILL.md](./skills/ui-evidence/SKILL.md)

## License

[MIT](./LICENSE)
