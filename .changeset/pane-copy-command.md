---
'koja': minor
---

Add `koja pane copy <id> --from <row>:<col> --to <row>:<col>` to copy a range of pane history to the
foreground client's clipboard. Rows are stable row numbers and columns start at 0. With `--print`,
the command writes the text to stdout and needs no client.
