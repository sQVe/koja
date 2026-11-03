---
'koja': patch
---

No change to the mods. The tests now share one fake for each Herdr module and run in parallel
without isolation, so they pass in any file order and in mutation runs.
