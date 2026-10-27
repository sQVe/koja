---
'koja': patch
---

Follow pi through session switches, tree moves, model and thinking changes, and quit.
`koja pi status` now shows the conversation pi switched to instead of a changed state. While a
switch is in progress it shows `switching`. After pi quits it shows no pi, and after pi stops
without quitting it shows `lost` with its last conversation. `recoveryEligible` is true for a saved
interactive session. The server ignores reports that arrive out of order. On quit, pi waits up to 2
seconds for its last report, so a clean quit never shows as `lost`.
