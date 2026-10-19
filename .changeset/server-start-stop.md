---
'koja': minor
---

Add `koja server start`, `koja server stop`, and `koja server run`. `koja server start` runs the
server in the background with one shell, and `koja server stop` ends the shell and removes the
socket. Each command takes `--socket` for another socket path and `--json` for a parseable form, and
none prompts. The server refuses a symlink or another file at the socket path, a socket path under a
directory other users can change, a socket directory other users can read, write, or enter, a socket
path whose parent directories do not exist, and a socket another user owns. It replaces only a
socket that refuses connections. The server locks a `.lock` file next to its socket, so only one
server runs on a socket path. `koja server start` succeeds only when the server it started is ready,
and it prints that server's error when the server cannot start its shell or write its log.
`koja server stop` also stops a server from another Koja build, so a restart moves the server to the
new build. `koja server run` exits with code 1 and a message when the server cannot clean up as it
stops, such as when it cannot remove its socket. `koja server stop` then exits with code 1 at once
and names the socket the server left.
