---
'koja': patch
---

Show a space or tab as working while a sub-agent inside it is running. Koja now computes the status
for the sidebar, tab bar, and picker with one shared rollup: blocked, then working, then done, then
idle. It counts working and blocked sub-agents that have no pane, at any depth, so a parent's
finished state no longer hides running work.
