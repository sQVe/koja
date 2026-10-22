---
'koja': patch
---

Set the owner-only mode on the session's temporary file before writing session data to it. A
world-readable temporary file left by a crash no longer exposes the session while it is saved.
