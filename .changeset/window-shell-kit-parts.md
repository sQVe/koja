---
'koja': patch
---

Add the kit's pane header part, a pane header menu, an icon-only toggle, and a mode pill. The pane
header draws a program icon, name, task, branch, and folder, reveals its split, zoom, and close
buttons on header hover while keeping their space, and shows the branch and folder in full while
they fit. A field that no longer fits cuts in the middle down to a minimum width, then drops whole
in order (folder, then branch) before the task cuts. Once a field drops, or below a compact width,
it swaps the four buttons for one visible overflow button whose menu lists the task, branch, and
folder above the four actions. Header buttons and icon-only toggles carry accessible names beside
their tooltips, the focused header draws a kit-owned focus fill, and the status mark draws done as a
green check icon. Add the `shell` and `pane-headers` mock scenes, which draw the window shell and
the header states from those parts.
