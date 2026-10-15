---
'phi': minor
---

`phi workspace create` no longer focuses the new workspace, unless no workspace is focused. Add
`--focus` to focus it. `--no-focus` keeps the default, and the last of the two flags wins. Without
`--label`, the server names the workspace after the base name of its directory.
