---
'koja': patch
---

Add six mock scenes of a pane header that shows the keyboard mode: `header-mode-insert`,
`header-mode-normal`, `header-mode-pending`, `header-mode-split`, `header-mode-split-normal`, and
`header-mode-lone`. The focused pane's header shows the mode as a flat tag and each pending key as a
keycap, and the tab bar draws no mode pill. In normal mode only the focused pane draws the accent
border. A shell pane with no agent shows the idle dot. A narrow header cuts and then drops the task,
shortens the folder to its last segment, cuts the branch in its middle, and last drops the folder.
The mods stay as they are.
