---
'koja': patch
---

Add `koja pi report` and `koja pi status <pane>`. Inside a pane, `koja pi report` reads one JSON
report from stdin and sends it with the pane's `KOJA_REPORT_TOKEN`. It checks the report before it
connects and never takes or prints the pass. `koja pi status` prints the pane's pi conversation, or
that it changed, in text or with `--json`. Every pi is marked not eligible for recovery.
