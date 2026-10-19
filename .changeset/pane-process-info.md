---
'koja': minor
---

Add `koja pane process-info <id>`. It shows the pane's shell process id, its foreground process
group, and each process in that group with its arguments and folder. `koja pane list` now shows each
pane's `cwd` and `foreground_cwd`. A folder that cannot be read prints as `null` in `--json`. Both
support `--socket` and `--json`, and the key names match herdr.
