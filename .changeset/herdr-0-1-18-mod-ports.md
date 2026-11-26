---
'koja': minor
---

Record all nine ported mods at Herdr 0.1.18. They take these Herdr changes:

- The pane menu inside a tab offers Rename first. A terminal outside a tab, such as a layout
  terminal block or a window, has no pane, so its menu offers no Split right, Split down, Zoom, or
  Close pane.
- A name given with `pane.rename` wins over the program name and the terminal title in the pane
  header.
- The new-tab menu opens with the agent list each machine reported last, and keeps listing the
  installed agents it remembers when a check fails, under "Could not check installed agents".
- A tab switches by wheel: one tab per notch, line deltas at once, and pixel deltas in steps of 20
  px then 60 px, at most one step per 100 ms. The active tab stays in view. An unnamed tab shows the
  agent's live title when that title tells its work.
- The palette lists the commands a mod declares in its `palette` list, in a Mod group, and runs one
  with the arguments the mod gave. A shortcut whose action names a command and arguments draws on
  its row, and the palette offers only themes the window can show now.
- The Changes panel reads `git status` once for every panel copy of a folder. Timed scans run only
  while the window is visible, and a slower scan is repeated less often. Its diff draws at the
  terminal's font size, tabs pad to four-column stops, and a wide glyph takes two columns.
- The spaces sidebar keeps the active space in view when a header above it appears or folds.
