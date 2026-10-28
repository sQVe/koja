---
'koja': minor
---

Save each pane's pi record with the session, and check it before a restored pane starts. A pane
whose saved pi conversation cannot reopen, such as one whose session file is gone or that another
pane also names, stays in the layout as a failed pane that names the reason and gets no shell or
input. A pane whose conversation can reopen starts its shell as before.

`koja pi status` adds `recovery` to its JSON output, with the restore check's `status` and `reason`,
or `null` for a pane restored without a record or whose pi has reported since. Text output adds a
`restore` line for such a pane.
