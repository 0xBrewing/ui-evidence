---
description: Configure or run ui-evidence for before/after UI review in this repository
---

If setup looks incomplete, read `{{LOCAL_INSTALL_DOC_PATH}}` and finish the setup first.

Then:

1. Run `{{UI_EVIDENCE_EXEC}} discover --format json`.
2. Ask only about unresolved values.
3. Persist config in `{{CONFIG_PATH}}`.
4. Run `{{UI_EVIDENCE_EXEC}} doctor --config {{CONFIG_PATH}}`.
5. Run `{{UI_EVIDENCE_EXEC}} run --config {{CONFIG_PATH}} ...` or the manual capture/compare/report/review sequence.
6. Return:
   - `review/index.html`
   - `report.<lang>.md`
   - `manifest.json`
   - pair and overview image paths
