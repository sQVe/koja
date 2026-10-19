---
'koja': patch
---

Pass a pane's bell to the terminal of the foreground client, and pass a pane's clipboard write
(OSC 52) to its clipboard. Koja copies with wl-copy, xclip, or xsel when it can, and writes OSC 52
over SSH or when no tool works.
