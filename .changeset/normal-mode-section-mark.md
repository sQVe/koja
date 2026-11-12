---
'koja': patch
---

Make Tab and Shift-Tab in normal mode mark the next and previous shown section instead of stepping
spaces. `s j` and `s k` still step spaces. While the sidebar is marked, `j`, `k`, `g g`, `G`,
`ctrl-d`, `ctrl-u`, and `enter` go to the sidebar as list commands, and Escape moves the mark back
to the panes. A hidden sidebar is skipped and loses its mark.

The list keys move a cursor over the shown rows of the marked sidebar, drawn as an accent outline
that starts on the active space. `enter` selects the space under the cursor.

When the sidebar becomes marked, or a list key moves the cursor, and the cursor row is outside the
view, the sidebar scrolls to show it. The sidebar now needs Herdr 0.1.15 or later.
