---
'koja': patch
---

`koja pi status` now lists why a pi cannot be recovered. JSON adds `ineligibleReasons`, and text
adds a `recovery` line that gives the reasons in plain words. Text output names the state, so
`reported`, `switching`, and `lost` each show their state.
