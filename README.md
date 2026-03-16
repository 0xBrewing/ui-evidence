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

## Install

```bash
pnpm add -D ui-evidence
```

Use the equivalent command for `npm`, `yarn`, or `bun` if needed.

## Quick start

Scaffold the config and agent bootstrap files:

```bash
pnpm exec ui-evidence install --agent both --config ./ui-evidence.config.yaml
```

Validate the setup:

```bash
pnpm exec ui-evidence doctor --config ./ui-evidence.config.yaml
```

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

Give the LLM [docs/installation.md](./docs/installation.md) and tell it to set up `ui-evidence` for the current repository.

That file is written as an installation playbook, not as marketing copy. The intended flow is:

1. install `ui-evidence`
2. run `ui-evidence install`
3. fix only unresolved config values
4. run `ui-evidence doctor`
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

## License

[MIT](./LICENSE)
