---
'koja': minor
---

Run `koja` with no command to attach to the server, and start the server first when none runs. When
two `koja` runs start at once, the one that loses the socket lock attaches to the server that won.
Press Ctrl+B then `d`, or run `koja detach`, to detach and leave the shell running. A new `koja`
reattaches and shows the same screen. A second client that attaches takes over from the first, and
the first exits with a message. Exiting the shell stops the server and the client.
