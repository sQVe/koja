# ADR 0020: A paste goes only to the running pane generation and the text it was confirmed for

**Date**: 2026-10-27\
**Status**: Accepted\
**Related**: [ADR 0010 (Every UI feature has a CLI equal)](./0010-cli-parity.md)

## Context

A paste can run commands. A shell without bracketed paste runs each pasted line as it arrives, so
multiline text needs the user's or agent's confirmation first. The confirmation and the paste happen
in two steps, and a lot can change between them.

A pane ID does not name one process. A pane keeps its ID when the server restarts and restores the
session, and the restored pane runs a new shell. The store's pane generation is new for each process
the server starts, but a restarted server counts generations from the start again. A paste that
names only a pane ID can reach a shell that nobody looked at.

Only the server parses pane output ([ADR 0003](./0003-session-server-and-client.md)), so only the
server knows whether the program in a pane asked for bracketed paste right now.

## Decision

The server pastes text only into the running pane generation a request names, and multiline text for
a program without bracketed paste goes out only with an authorization for that pane, generation, and
text.

### Encoding on the server

- The server reads the pane's modes when the request arrives and encodes the text for them. Line
  ends become CR. With bracketed paste on, the server removes every paste start and end marker from
  the text and wraps it in one pair.
- A paste the server refuses writes no bytes.

### Authorization

- When multiline text needs confirmation, the server answers `confirmationRequired` with an
  authorization instead of writing.
- The authorization is `<generation>.<digest>`. The digest is an HMAC-SHA256 of the pane ID, the
  generation, and the text, keyed by a random secret each server makes when it starts.
- The secret lives in the server's runtime registry, never in the store or the session file. An
  authorization from an earlier server therefore never matches, even when the generation repeats.
- A caller sends the same text again with the authorization. The server accepts it only for the live
  pane's ID and generation and the same text. Clients treat the authorization as opaque.

### Commands

`koja pane paste` never prompts. It prints the `confirmationRequired` result with its authorization
and exits nonzero, and `--authorize` sends the confirmed text.

## Consequences

### Positive

- Confirmed text reaches only the shell and the text the confirmation was for.
- The UI and the CLI share one encoding and one confirmation rule, so they cannot drift.
- An agent can confirm a paste without a prompt, as [ADR 0010](./0010-cli-parity.md) requires.

### Negative

- Multiline text for a program without bracketed paste takes two requests.
- A server restart ends every authorization it gave, so a caller must ask again.

## Alternatives considered

### Pane ID only

Send the paste to a pane ID, and confirm by pane ID. Rejected because a pane ID survives a restart,
so a confirmation for one shell could paste into the next one.

### Client-side encoding

Let each client read the modes from the rows it draws, encode the text, and send raw bytes. Rejected
because the CLI draws no rows and would need a second mode feed, and the modes a client last drew
can be older than the pane's. The server reads the modes the pane has when it writes.

### A plain digest of the text

Use a SHA-256 of the text as the digest. Rejected because generations repeat after a server restart,
so a digest without a per-server secret and the pane ID would authorize the same text in a restored
pane or another pane.
