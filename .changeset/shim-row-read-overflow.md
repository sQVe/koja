---
'koja': patch
---

Fix a stack buffer overflow in the terminal library each time the server read pane rows, such as for
`koja pane read` or a scrolled terminal client.
