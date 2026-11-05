---
'koja': patch
---

Keep the previous Changes list when a refresh fails, show a stale line with its age and a Retry, and
disable Commit until the same repository reads again. A failed first read and a failed folder watch
now show their own error lines. A file change during a read now starts another read before Commit
turns on, so Commit never stages files the list does not show. The Changes list draws its text and
rows through the kit.
