---
'koja': minor
---

Add `koja client list`, which lists the attached clients, their views, and the foreground client.
Add `koja detach --client <id>` to detach one client. Without `--client`, `koja detach` detaches the
foreground client, and an unknown id fails with `unknownClient`. Both commands support `--socket`
and `--json`.
