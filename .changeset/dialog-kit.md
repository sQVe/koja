---
'koja': minor
---

Add Koja's own confirm and prompt dialog parts to the UI kit: dialog buttons in solid, danger, and
outline kinds, and a dialog frame on the rounded popup surface. The kit gallery shows a sample
confirm and a sample prompt.

Add the `koja-confirm` and `koja-prompt` mods, ports of Herdr's confirm and prompt dialogs drawn
with those parts.

Closing a space and renaming a space or tab now ask first in these dialogs. The space and tab menus,
the palette, and a tab double-click open them. F2 and Shift-F2 no longer open Herdr's rename prompt,
so Rename has no shortcut.

Normal mode's `ctrl-t q` also asks through the confirm when it closes the last tab of a space. The
dialog takes the keyboard, so Enter and Esc reach it and normal mode gets the keyboard back.
