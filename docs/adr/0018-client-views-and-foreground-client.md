# ADR 0018: Each client has its own view, and one client is the foreground client

**Date**: 2026-10-23\
**Status**: Accepted\
**Related**: [ADR 0003 (One parser per pane in the server, drawing in the client)](./0003-session-server-and-client.md),
[ADR 0006 (One server store with pure transitions and a typed change feed)](./0006-server-state-store.md)

## Context

Later view features, such as scroll, copy, and mouse, address one client. The store needs client
identity before those features can select a view. The model is prepared for several clients, but
takeover still permits one attached client at a time. With one client attached, Koja must keep its
current behavior.

Pane focus, layout, and zoom describe a tab, not a terminal. All views of a tab share the same
focused pane. herdr is the reference for this behavior.

## Decision

Each attached client has its own view, and one attached client is the foreground client. Takeover
remains: a new attach ends the previous client, so simultaneous attachment is not enabled yet.

### Views

- A view holds the focused workspace and the active tab of every workspace. Pane focus, layout, and
  zoom stay shared per tab.
- The server keeps one default view. A new client starts from it, and commands that need a default
  target read it.
- A focus from a terminal client moves that client's view and the default view. A focus from the CLI
  moves every view and the default view. A create with focus follows the same scope.
- A detach or takeover leaves the default view as it is. Takeover still ends the previous client
  when a new client attaches.
- Closing a workspace, tab, or pane repairs every view.
- A save writes only the default view through the existing fields, and a restore sets it. Client ids
  and the foreground client are not saved, so the file format does not change.

### Foreground client

- A client becomes the foreground client when it attaches, sends pane input, resizes, or sends a
  request of its own.
- When the foreground client leaves, the remaining client with the latest activity becomes
  foreground, or none does. Activity is a counter in the store, not a clock.
- Bells and clipboard writes go only to the foreground client.
- A view command uses the client it names, or the foreground client when it names none.
- A request that needs a client and has neither an explicit client nor a foreground client fails
  with `noClient`. Focus commands still change the default view.

## Consequences

### Positive

- The model gives each client its own view, so later view features can target one client without
  moving the others.
- Pane focus, layout, and zoom stay shared per tab, as in herdr.
- Foreground effects and commands without an explicit target have a deterministic target, and the
  activity order does not depend on a clock.

### Negative

- The store and the protocol carry a view per client, and every close must repair those views.
- The CLI reads the default view, so it shows the view a new client starts with, not the foreground
  client's view.
- Separate client views are not saved, so only the default view returns after a restart.
- Pane focus stays shared, so views of one tab cannot focus different panes.

## Alternatives considered

### Per-client pane focus

Each client remembers its own focused pane, while layout and zoom stay shared. Rejected because
herdr shares pane focus per tab, and Koja copies that model. Views of one tab would otherwise
disagree about which pane receives input.
