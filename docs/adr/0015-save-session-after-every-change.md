# ADR 0015: Save the session after every change and start empty on a file it cannot use

**Date**: 2026-10-14\
**Status**: Accepted\
**Related**: [ADR 0006 (One server store)](./0006-server-state-store.md),
[ADR 0012 (One server per socket path)](./0012-socket-path-lock.md)

## Context

The server holds workspaces, tabs, and splits only in memory, so a stop, a crash, or a reboot loses
the setup. Panes are processes, and they cannot come back. Only the layout around them and each
shell's folder can.

A server can die with no warning, such as on SIGKILL or a power loss. A save that runs only on stop
loses the setup in exactly those cases. One state folder can also serve several servers, one per
socket path, so a save file must not be shared between them.

## Decision

The server writes the session to a file after every committed change to workspaces, tabs, panes,
layout, or focus, and once more on stop. On start it reads the file and restores the session with
one store intent.

The file name comes from the socket path, with its symlinks resolved, so each server has its own
file. The writer replaces the file in one rename, and a write that waits is replaced by a newer one,
so the file is always whole and at most one write is queued. The final save runs before any pane
ends, because pane exits during the stop would otherwise change the file.

When the server builds a save, it reads each running pane's shell folder. A restored pane whose
folder cannot be read keeps the folder it was restored with, so a pane whose shell never started
does not lose that folder.

On restore, each pane starts a shell in its saved folder. It uses the workspace root only when no
folder was saved. If the saved folder is gone, or the saved shell cannot start, the pane stays in
the layout as failed with an error, and nothing starts in it. A later save keeps its saved folder.
The rest of the layout restores, and repairing the missing folder or shell and restarting the server
brings the pane back.

A file that is broken or has a newer version is logged with its path, and the server starts with no
workspace. The file stays as it is until the next save replaces it.

## Consequences

### Positive

- A killed server loses at most the write in flight.
- Servers on different socket paths never read each other's setup.
- A bad file never stops the server from starting.
- A restored shell starts where the user left it, not in the workspace root.
- A missing folder or shell costs one pane, not the saved layout.

### Negative

- Every change that touches the setup costs one small file write.
- The next save replaces a file that was unreadable, so a newer build's file is lost if an older
  build starts and then changes anything.
- The server reads the filesystem on every save to find each running pane's shell folder.
- A restored pane whose folder is gone or whose shell cannot start stays failed until the user
  repairs it and restarts the server.

## Alternatives considered

### Save on a timer

The server writes the session every few seconds when it has changed. Rejected because it loses the
changes of the last interval on a kill, and it adds a timer to reason about for no gain in
simplicity.

### Save only on stop

The server writes once while it stops. Rejected because a kill or a crash, the cases that need a
save most, would leave no file or an old one.

### Refuse to start on a file it cannot use

The server exits with an error when the file is broken or newer. Rejected because the user then
cannot use Koja until they delete a file by hand.
