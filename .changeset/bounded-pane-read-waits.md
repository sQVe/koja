---
'koja': patch
---

Limit reads waiting for synchronized pane output to 64 per pane across connections. Extra reads fail
without replacing an accepted read or its snapshot. Disconnecting frees waiting read capacity. The
CLI reports overload without retrying. Attached scroll reads wait for later activity after overload
instead of requesting the same rows again immediately.
