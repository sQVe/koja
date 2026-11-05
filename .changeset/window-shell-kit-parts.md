---
'koja': patch
---

Add the kit's pane header part, an icon-only toggle, and a mode pill. The pane header draws a
program icon, name, task, branch, and folder, reveals its split, zoom, and close buttons on header
hover while keeping their space, hides the folder before the branch before the task cuts, and swaps
the four buttons for one reserved overflow button in a compact header. Header buttons and icon-only
toggles carry accessible names beside their tooltips, and the focused header draws a kit-owned focus
fill. Add the `shell` and `pane-headers` mock scenes, which draw the window shell and the header
states from those parts.
