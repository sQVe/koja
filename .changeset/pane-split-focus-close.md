---
'koja': minor
---

Add `koja pane split <id> --direction below|right`, `koja pane focus <id>`, and
`koja pane close <id>` to split a pane, move focus, and close a pane with its process. Each command
supports `--socket` and `--json`, and fails with a message and exit code 1 for an unknown pane.
`koja pane list` now shows each pane's `columns` and `rows`.
