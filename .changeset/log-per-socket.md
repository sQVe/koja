---
'koja': patch
---

Fix log rotation when several servers share one state directory. Each server now writes its own log
at `$XDG_STATE_HOME/koja/logs/<key>.log`, one file per socket, instead of the shared
`koja/server.log`.
