---
'koja': patch
---

Master tabs now rotate their panes forward or backward, and the new master pane takes the focus. In
a zoomed tab, focusing, adding, or splitting a pane moves the zoom to the pane that takes the focus
instead of unzooming the tab. Focus can also move to the neighboring pane on the left, right, up, or
down. Moving past the edge of the tab does nothing, and a zoomed tab keeps its zoom on the new pane.

Use `koja pane rotate <id> --direction forward|backward` to rotate a master tab, and
`koja pane focus <id> --direction left|right|up|down` to move focus. The action search lists the
same actions as Rotate panes forward, Rotate panes backward, and Focus pane left, right, up, or
down.
