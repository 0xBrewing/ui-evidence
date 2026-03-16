---
description: Discover, configure, and run ui-evidence for before/after UI review in this repo
---

If the user wants to bootstrap ui-evidence into another repo, read `docs/installation.md` first.
Prefer the workflow in `skills/ui-evidence/SKILL.md`.

For ui-evidence work in this repo:

1. Run `ui-evidence discover --format json`.
2. Ask only about unresolved values.
3. Persist `ui-evidence.config.yaml`.
4. Run `ui-evidence doctor`.
5. Run `ui-evidence run` or the manual capture/compare/report/review sequence.
6. Return the review HTML path, report path, manifest path, and the key comparison images.
