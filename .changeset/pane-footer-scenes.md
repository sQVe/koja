---
'koja': patch
---

Add twelve mock scenes that compare a pane footer with a pane header: `footer-insert`,
`footer-normal`, `footer-pending`, `footer-split`, `footer-split-normal`, and `footer-lone`, and
their `header-mode-*` twins. A pair differs only in where each terminal pane draws its row: below
the terminal or above it. The row shows the icon, name, task, branch, folder, status, and overflow
button. A narrow row cuts and then drops the task, then cuts the branch, then drops the folder. The
focused pane's row also shows the keyboard mode as a flat tag and the pending count and prefix as a
key-cap, and the tab bar draws no mode pill. The Changes panel draws its title row at the same edge
as the panes. The mods stay as they are.
