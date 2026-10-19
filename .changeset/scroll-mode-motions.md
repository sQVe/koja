---
'koja': minor
---

Add scroll mode. `[` in normal mode enters it on the focused pane, and `q` or Escape leaves it. The
status bar shows `SCROLL`, and a cursor marks the position in the pane's history. The cursor moves
as in herdr's copy mode: `h j k l` and the arrow keys, `w b e`, `W B E`, `0 ^ $`, `{ }`, Home and
End, PageUp and PageDown, Ctrl+U, Ctrl+D, Ctrl+F, and `g` and `G`. The view scrolls when the cursor
leaves it, and `G` returns it to the bottom. `q`, Escape, and Ctrl+B restore the view from when
scroll mode started. Ctrl+B still leaves scroll mode for normal mode. A motion that needs history
rows the client has not fetched yet waits for them. Moving focus to another pane leaves scroll mode.
