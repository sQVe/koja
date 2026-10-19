---
'koja': minor
---

Start a new split pane or tab in the folder of the pane it comes from. The folder is the running
command's folder, else the shell's folder. When that folder is deleted or cannot be entered, the
pane starts in the workspace root. This applies to the `s`, `v`, and `t` keys, `koja pane split`,
and `koja tab create`.

Add `--cwd <dir>` to `koja pane split` and `koja tab create` to start the new pane in a chosen
folder. A relative path resolves against the folder the command runs in. A path that is not a
directory is refused, and nothing is created.
