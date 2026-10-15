---
'phi': minor
---

Forward the mouse from `phi attach` to the pane under the pointer. The client turns on mouse
reporting in the outer terminal and turns it off on detach. A pane gets clicks, drags, motion, and
the wheel at its own coordinates when it asked for them. A drag and the release go to the pane where
the press started. A left click focuses the pane, workspace, or tab under the pointer. A click on an
unfocused pane that asked for the mouse also reaches that pane. Keys typed after a click on a pane
or workspace wait until the focus changes.
