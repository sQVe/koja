---
'koja': patch
---

Return in the Changes commit field now commits once a read in flight finishes, instead of dropping
the request and leaving the files uncommitted.
