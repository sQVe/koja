# ADR 0015: Save the session after every change and start empty on a file it cannot use

**Date**: 2026-10-14\
**Status**: Accepted\
**Related**: [ADR 0006 (One server store)](./0006-server-state-store.md),
[ADR 0012 (One server per socket path)](./0012-socket-path-lock.md)

## Context

The server holds workspaces, tabs, and splits only in memory, so a stop, a crash, or a reboot loses
the setup. Panes are processes, and they cannot come back. Only the layout around them, each shell's
folder, and each pi conversation can, because pi saves its conversation to a session file.

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
ends, because pane exits during the stop would otherwise change the file. A failed final save is
reported by `koja server stop`, which exits nonzero.

Each save syncs the temporary file, renames it over the session file, and then syncs the folder.
When the save creates missing folders, it also syncs the folder that holds each new one. A crash
before the rename keeps the old file. Once the folder sync finishes, the new file survives a power
loss. That durability depends on the filesystem honoring `fsync`. The tests do not establish that.

A file that is broken or has a newer version is not replaced on start. Before the first save that
would replace it, the writer copies its bytes to the lowest free `<session file>.broken-<n>` or
`<session file>.newer-<n>`. The copy is owner-only, and the writer syncs it and its folder.
Preserved files are never deleted automatically. A save is refused while the copy fails, and the
next save tries again. After a copy succeeds, later saves do not copy again.

When the server builds a save, it reads each running pane's shell folder. A restored pane whose
folder cannot be read keeps the folder it was restored with, so a pane whose shell never started
does not lose that folder.

On restore, each pane starts a shell in its saved folder. It uses the workspace root only when no
folder was saved. If the saved folder is gone, or the saved shell cannot start, the pane stays in
the layout as failed with an error, and nothing starts in it. A later save keeps its saved folder.
The rest of the layout restores, and repairing the missing folder or shell and restarting the server
brings the pane back.

A pane that ran pi saves the exact session file that pi reported for it. On restore, that pane
starts its shell, and the shell starts pi on that session file. Quitting pi leaves the shell, as it
did before the restart. Koja sends pi no prompt, so the conversation waits for the user. Pi opens
the file at its newest saved entry.

Pi writes the session file only at the conversation's first message. Each save therefore records
whether the file existed. A file that never existed starts pi on the same path, since no
conversation was lost. A file that existed and is now missing, or that another live pane owns, makes
the pane fail with an error; Koja never starts a different conversation in its place. No other
program restarts: Koja does not replay shell history or rerun commands.

A file that is broken or has a newer version is logged with its path, and the server starts with no
workspace. The next save copies it to a preserved file first.

## Consequences

### Positive

- Recovery uses the last completed save.
- Servers on different socket paths never read each other's setup.
- A bad file never stops the server from starting.
- A file the server cannot use keeps its bytes in a preserved file.
- A restored shell starts where the user left it, not in the workspace root.
- A pi pane returns to its saved conversation, and quitting pi still leaves a shell.
- A missing folder or shell costs one pane, not the saved layout.

### Negative

- A killed server can lose changes in the write in flight and the queued save.
- Every change that touches the setup costs one small file write.
- Preserved files accumulate. The server never deletes them, so the user removes them by hand.
- A save is refused while a preserved copy cannot be written, so no change is saved until the copy
  succeeds.
- The copy is written under its final name. A crash during the copy can leave a partial preserved
  file. The original stays as it was, and the next start copies it again under the next number.
- The server reads the filesystem on every save to find each running pane's shell folder.
- A restored pane whose folder is gone or whose shell cannot start stays failed until the user
  repairs it and restarts the server.
- Other programs, such as an editor or a build, do not come back. The user starts them again.
- A conversation's saved history returns, but not work in flight: a running tool, a partial reply,
  or an unsent draft is lost.
- Pi keeps its current branch point only in memory. A move to an earlier branch with `/tree` that no
  later message extends is lost, and pi reopens at the newest saved entry.

## Alternatives considered

### Save on a timer

The server writes the session every few seconds when it has changed. Rejected because it loses the
changes of the last interval on a kill, and it adds a timer to reason about for no gain in
simplicity.

### Save only on stop

The server writes once while it stops. Rejected because a kill or a crash, the cases that need a
save most, would leave no file or an old one.

### Restart every program that was running

The server saves each pane's command and runs it again on restore. Rejected because a command seen
from outside the shell cannot recreate shell functions, pipelines, or environment, and running a
build or a deploy again can repeat its effects. Neither Herdr nor TUIOS restarts ordinary programs
either; both reopen agent conversations from their saved sessions.

### Start pi as the pane's own process

The restored pane runs pi directly instead of a shell. Rejected because quitting pi would then close
the pane, while before the restart it returned to a shell.

### Refuse to start on a file it cannot use

The server exits with an error when the file is broken or newer. Rejected because the user then
cannot use Koja until they delete a file by hand.
