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
- A record is shown only while its process still runs with the same start time.
- A later report from the same process that differs in anything marks the record as changed and
  drops its identity. Koja shows that the conversation changed instead of an identity it cannot
  confirm.

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
- The extension stays small and never depends on the protocol's version.

### Negative

- A program the user runs inside a pane can set that pane's record. Koja does not defend against the
  user's own programs.
- Each report starts a short `koja` process.
- A pi started in a new session, such as through `setsid`, cannot report to its pane.

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
