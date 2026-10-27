# ADR 0019: A pi report counts only with its pane's pass and from a live process in that pane

**Date**: 2026-10-26\
**Status**: Accepted\
**Related**: [ADR 0013 (A terminal multiplexer built around pi)](./0013-multiplexer-built-around-pi.md)

## Context

A pi extension tells the server which conversation runs in a pane. Recovery will later reopen that
conversation after a restart, so a wrong report reopens the wrong chat. Reports can go wrong without
anyone lying: a pi the user quit can report late, a pi in one pane can carry another pane's id, and
a pi can outlive the server it first reported to.

A pane id, the shell's process id, or the pane's generation cannot tell two pi processes apart,
because the user can quit pi and start another in the same shell. Every process the user runs can
read the environment and memory of the user's other processes, and Bun gives the server no way to
learn which process sent a socket message.

## Decision

The server accepts a pi report only when it carries the pass of the pane's current start and names a
live process in that pane's shell session. It binds the record to that process. The server trusts
programs the user runs: a program inside the pane that pretends to be pi can set that pane's record.

### The pass

- Each pane start creates a new random pass. The server keeps it in the runtime registry and gives
  it to the shell in the environment. A new start or a new server makes a new pass, so a report from
  an earlier shell or an earlier server fails.
- The pass never appears on a command line, in a log, in the store, in a saved session, or in CLI
  output.

### The process

- A report names the pi process. The server accepts it only when that process is in the pane's shell
  session, and identifies it by its process id together with its start time, so a reused process id
  never matches an older record.
- Only a report that starts a pi session can make a record for a process other than the recorded
  one, and the new record never inherits the earlier identity. Any other report from another process
  is refused.

### The lifecycle

Each report names the pi event behind it and carries a sequence that increases with every report one
pi process sends, including across pi's extension reloads in that process.

- Ordering: the server ignores a report from the recorded process whose sequence is not greater than
  the last one it accepted. Reports travel through separate short processes, so they can arrive out
  of order.
- A start, tree, model, or thinking report replaces the record's fields.
- A shutdown for a session switch makes the record switching, and status shows no identity until the
  next start report. Only a start report completes a switch.
- A shutdown for quit makes the record exited, and status shows no record. The server keeps the
  process and sequence, so a delayed report from that process never brings the identity back.
- On quit, pi waits up to 2 seconds for its quit report command to finish, so a clean quit is not
  shown as a crash. Every other report runs without pi waiting for it.
- pi can exit before its quit report arrives. The server accepts a quit report from a gone process
  only when it names the process id of the current record in the same pane generation, with a
  greater sequence. It can only make that record exited.
- A record whose process is gone without a quit is shown as lost with its last identity, so a crash
  keeps what recovery needs.
- Status lists the reasons a record cannot be recovered: a Tau worker owns the pi, a switch is
  pending, pi reported no session file, or the session file is not on disk as a regular file.
  Computing the reasons never changes pi or the pane.

### The path

The extension reports by running the `koja` command the pane environment names, which then talks to
the server. That command is always the server's own build, so the extension needs no version
handshake of its own.

### Refusal

A refused report changes no record and never ends the pane's shell or its other processes.

## Consequences

### Positive

- Late, misdirected, and pre-restart reports cannot label a pane.
- Quitting pi and starting another in the same shell never leaves the first pi's identity on the
  pane.
- A session switch, a tree move, or a model change keeps the record current, and a crashed pi keeps
  its last identity for recovery.
- The extension stays small and never depends on the protocol's version.

### Negative

- A program the user runs inside a pane can set that pane's record. Koja does not defend against the
  user's own programs.
- Each report starts a short `koja` process.
- Quitting pi can take up to 2 seconds longer when the quit report is slow.
- A pi started in a new session, such as through `setsid`, cannot report to its pane.
- A lost quit report leaves an exited pi shown as lost.

## Alternatives considered

### Trust the pane id the extension sends

Accept any report that names a pane. Rejected because a late or misdirected report would label the
wrong pane and later reopen the wrong conversation.

### Prove the sending process through the socket

Learn the sending process from the socket's peer credentials, so a program in the pane cannot
pretend to be pi. Deferred because Bun exposes no peer credentials, so this needs native code, and
it still would not stop a program that reads pi's memory as the same user.

### The extension connects to the server's socket itself

Keep a socket connection from the extension, as message delivery to pi will need. Deferred for
reports because the server refuses a client of another build, and the extension would then need its
own version handshake. A later delivery channel can start the same `koja` command as a long-lived
process.
