---
'phi': minor
---

Add `phi client list`, which lists the attached clients, their views, and the foreground client. Add
`phi detach --client <id>` to detach one client. Without `--client`, `phi detach` detaches the
foreground client, and an unknown id fails with `unknownClient`. Both commands support `--socket`
and `--json`.
