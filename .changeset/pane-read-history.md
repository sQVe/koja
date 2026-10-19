---
'koja': minor
---

`koja pane read` reads pane history. Choose rows with `--source visible|recent|recent-unwrapped` and
`--lines <n>`, or read a stable row range with `--from <row> --to <row>`. The default source is
`recent`, the last 80 rows, where it was the visible screen. `recent-unwrapped` joins lines that the
terminal wrapped. A read comes from one snapshot of the pane, sent in parts, so it stays whole while
the pane writes. A selection over 16 MiB of encoded rows is read in several snapshots, and fails if
the pane switches between its primary and alternate screens between them. A range below the oldest
kept row fails with that row number. `--json` now prints `pane`, `source`, `epoch`, `oldest`,
`from`, `to`, and `lines`, where it printed `pane` and `rows`.
