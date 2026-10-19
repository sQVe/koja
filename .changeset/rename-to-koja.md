---
'koja': minor
---

Rename the app from Phi to Koja. Run it as `koja`. The server socket is now
`$XDG_RUNTIME_DIR/koja/koja.sock`, or `/tmp/koja-<uid>/koja.sock` without `XDG_RUNTIME_DIR`. The log
and saved sessions are now in `$XDG_STATE_HOME/koja`, or `~/.local/state/koja`. Panes get `KOJA_*`
variables, such as `KOJA_SOCKET_PATH` and `KOJA_PANE_ID`, and `TERM_PROGRAM=koja`. Koja does not
read the old `PHI_*` variables, socket, or saved sessions, so it starts with fresh sessions. Stop
the old server with `phi server stop` before you start Koja.
