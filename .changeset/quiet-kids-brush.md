---
'koja': patch
---

Preserve a session file the server cannot use. When the server starts with a broken file or one from
a newer version, the first save copies that file to a new owner-only file next to it before it
replaces the file. A save is refused while the copy fails, and preserved files are never deleted
automatically.
