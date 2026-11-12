---
'koja': patch
---

Add six mock scenes that explore a pane footer in place of the pane header: `footer-insert`,
`footer-normal`, `footer-pending`, `footer-split`, `footer-split-normal`, and `footer-lone`. Each
terminal pane draws its icon, name, task, branch, folder, status, and overflow button below the
terminal, and a narrow footer drops the folder and then cuts the branch. The focused pane's footer
also shows the keyboard mode as a flat tag and the pending count and prefix as a key-cap, and the
tab bar draws no mode pill. The Changes panel draws its title row at the bottom in the shell scenes.
The mods stay as they are.
