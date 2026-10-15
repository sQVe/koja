---
'phi': minor
---

Print JSON by default for `phi workspace list|create|focus|rename|close`,
`phi tab list|create|focus|close`, and `phi pane list|split|focus|zoom|resize|close`. `--json` is
still accepted and prints the same JSON. `phi pane read`, `phi pane send`, and
`phi pane process-info` keep text output by default.
