---
'koja': minor
---

Add `koja pane read` to print the pane's visible rows and `koja pane send <text>` to send text to
its shell. Both commands support `--socket` and `--json`, and work without a terminal client
attached. Agent reads leave pending row updates available to terminal clients.

Send binary row updates to terminal clients after the welcome and store snapshot. Connections
without a terminal size receive the state feed but no row updates.

Refuse pane commands from another build with both Koja versions and Ghostty commits. The error
explains that `koja server stop` followed by `koja` restarts the server and ends every pane.
