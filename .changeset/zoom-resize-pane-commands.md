---
'phi': minor
---

Add `phi pane zoom <id>` and `phi pane resize <id> --direction left|right|up|down --cells <n>`. Zoom
shows one pane over the whole tab, and a second zoom restores the split. Resize moves the nearest
split edge in that direction. Both support `--socket` and `--json`. `phi pane list` now shows which
pane is zoomed, as `zoomed` in `--json`.
