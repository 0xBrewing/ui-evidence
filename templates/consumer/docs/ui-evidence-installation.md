# ui-evidence Installation

Read this file and complete the setup for this repository.

## Goal

Set up `ui-evidence` so future requests like:

- "compare this UI before and after"
- "capture the checkout modal before/after"
- "use ui-evidence to compare against main"

can run with minimal follow-up questions.

## Rules

- Use `{{UI_EVIDENCE_EXEC}}` as the deterministic engine.
- Keep the config in `{{CONFIG_PATH}}`.
- Ask only about unresolved values from discovery.
- Create hooks only if deterministic state cannot be reached from route + wait target.
- Prefer stable routes and `data-testid` waits.

## Setup procedure

1. Run discovery:

```bash
{{UI_EVIDENCE_EXEC}} discover --format json
```

2. If `{{CONFIG_PATH}}` needs updates, patch it instead of inventing ad hoc browser steps.

3. Validate setup:

```bash
{{UI_EVIDENCE_EXEC}} doctor --config {{CONFIG_PATH}}
{{UI_EVIDENCE_EXEC}} doctor --config {{CONFIG_PATH}} --ready
```

4. If setup is incomplete, fix the config, hooks, or unresolved values and run `doctor` again.

If generated skill/docs files drift later, run `{{UI_EVIDENCE_EXEC}} install --sync`.

5. When setup is complete, use one of:

```bash
{{UI_EVIDENCE_EXEC}} run --config {{CONFIG_PATH}} --stage <stage-id>
{{UI_EVIDENCE_EXEC}} run --config {{CONFIG_PATH}} --stage <stage-id> --before-ref main
{{UI_EVIDENCE_EXEC}} run --config {{CONFIG_PATH}} --stage <stage-id> --after-attach http://127.0.0.1:3000 --resume
{{UI_EVIDENCE_EXEC}} snapshot --config {{CONFIG_PATH}} --stage <stage-id> --profile mobile-en
```

6. Return these paths after execution:

- `review/index.html`
- `report.<lang>.md`
- `manifest.json`
- key pair and overview images

Open `review/index.html` directly from disk. A local web server is not required. If a stage review reuses snapshot `current` captures, the stage folder is still self-contained and portable on its own.

## Natural-language requests

When the user asks for UI comparison without naming the command:

1. Assume they want `ui-evidence`.
2. Read this file if setup context is missing.
3. Use `{{UI_EVIDENCE_EXEC}}`.
