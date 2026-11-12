---
'koja': patch
---

Make Tab and Shift-Tab in normal mode mark the next and previous shown section instead of stepping
spaces. `s j` and `s k` still step spaces. While the sidebar is marked, `j`, `k`, `g g`, `G`,
`ctrl-d`, `ctrl-u`, and `enter` go to the sidebar as list commands, and Escape moves the mark back
to the panes. A hidden sidebar is skipped and loses its mark.
