---
'phi': minor
---

Pass the kitty keyboard protocol to panes. `phi attach` asks the outer terminal for kitty keys and
sends each key to the focused pane in the encoding that pane asked for. A pane that does not ask for
kitty flags still gets legacy keys. Releases reach only panes that ask for event types. Ctrl+B
enters normal mode under any pane flags. A terminal without kitty support keeps working as before.
