---
'koja': minor
---

Start the data layer in the spaces sidebar. Each sidebar copy claims the data lease, renews its
heartbeat every 10 seconds, and publishes the empty snapshot while it owns the lease. A copy that
stops renewing, such as after a reload, is taken over once its heartbeat is 30 seconds old. The kit
gallery shows a Data layer section with the owner, generation, revision, heartbeat age, and whether
the snapshot is live, stale, or unavailable.
