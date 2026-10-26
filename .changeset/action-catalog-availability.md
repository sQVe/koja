---
'koja': patch
---

Route normal-mode keys through one action catalog. A key bound to an action that the current view
cannot run, such as `j` with one workspace, now does nothing instead of sending a request.

In normal mode, `/` opens action search and `?` opens the shortcut help. Typing filters the search
by title or id, Up and Down select a result, and Enter runs it. Up and Down scroll the help.
Unavailable results show as unavailable and do nothing. Escape closes either view. While a view is
open, typed text, paste, and mouse input do not reach the pane.

`koja action list` prints every action with its keys, whether the CLI can run it, and whether it is
available. `koja action run <id>` runs one action by name. Use `--pane` with a `pane.*` action, and
`--workspace` with a `workspace.*` or `tab.*` action other than `workspace.create`, to pick the
target. Both take `--json`.
