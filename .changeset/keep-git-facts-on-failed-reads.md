---
'koja': patch
---

Keep the last good git facts when a git read or a folder watch fails. A layout reply whose flags are
not `true` or `false` is now a failed read instead of a checkout. A folder change that arrives just
before the next watch fails now reaches its listener, so the Changes view refreshes instead of
showing stale facts. A refresh whose task Herdr refuses no longer leaves the Changes view on
`Loading changes…`.
