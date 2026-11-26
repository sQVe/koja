---
'koja': minor
---

Record the confirm, prompt, terminal menu, new-tab menu, and pane header mods at Herdr 0.1.18. Three
of them take Herdr's changes:

- The pane menu inside a tab offers Rename first. A terminal outside a tab, such as a layout
  terminal block or a window, has no pane, so its menu offers no Split right, Split down, Zoom, or
  Close pane.
- A name given with `pane.rename` wins over the program name and the terminal title in the pane
  header.
- The new-tab menu opens with the agent list each machine reported last, and keeps listing the
  installed agents it remembers when a check fails, under "Could not check installed agents".

The Changes panel pauses its timed `git status` scans while the window is hidden, and scans again
once when it is shown again.
