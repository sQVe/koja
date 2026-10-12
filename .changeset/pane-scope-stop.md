---
'phi': minor
---

`phi server stop` now ends every process a pane started, even one that called `setsid`. Phi starts
each pane's shell in its own systemd user scope and ends the scope when the server stops. Without a
systemd user manager, stop ends the shell's session as before, and a process that called `setsid`
can survive. The server log says which of the two it uses. A process you detach in a pane now ends
when the server stops. To keep one, start it outside the pane, such as with `systemd-run --user`.
