---
'koja': patch
---

Add mock scenes for four structures of the right side panel with Files, Changes, Stack, and Workers:
tabs (`panels-tabs-*`), collapsible sections (`panels-sections`), the stack as a spine
(`panels-spine`, `panels-spine-files`), and two docks (`panels-docks`). Add three takes on the stack
as a spine (`spine-inline`, `spine-rail`, `spine-pinned`), and `rail-*` scenes that show the graph
rail without a commit bar when the work is large, clean, a single PR, a branch with no PR, on
`main`, after a failed read, and in normal mode. Add `split-two-*` and `split-three-*` scenes that
split the panel into a Stack and a Workers section, or into Stack, Changes, and Workers. Add
`space-*` scenes of the chosen panel, named Space, with Stack and Workers sections in every state.
The `shell` scene shows the Space panel in place of Changes, with one Space toggle in the tab bar.
