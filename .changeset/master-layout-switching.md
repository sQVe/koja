---
'koja': minor
---

Start new tabs in a master layout: one pane fills the tab, and with more panes the first one takes
the left half while the rest stack on the right. Switch a tab between master and its remembered
split layout with `koja tab layout <tab> master|legacy` or the "Use master layout" and "Use legacy
split layout" actions, without restarting its panes. Add a pane with `koja pane add <pane>` or the
"New pane" action (`n`): a master tab appends it on the right, and a split tab splits the pane to
the right. Saved split tabs stay split. `koja pane split` and `koja pane resize` fail in a master
tab and name the switch to the legacy layout. When the window is too small for a master tab, Koja
shows a warning, keeps the panes running, and draws them again once the window fits. `koja tab list`
shows each tab's layout.
