# ADR 0010: Koja rolls up space and tab status itself

**Date**: 2026-11-03\
**Status**: Accepted\
**Related**: [ADR 0004 (Separate mods that share one UI kit)](./0004-separate-mods-one-kit.md)

## Context

The sidebar, the tab bar, and the picker each show one status mark for a space or a tab. The mark
should tell the user whether any work in it is blocked, running, finished, or quiet.

Herdr gives each space and tab a status, but it counts only the terminals that are panes in the tab.
A sub-agent that runs in the background has no pane, so Herdr's status never sees it. Herdr ranks an
unseen finished turn above running work, so a space can show done while another pane in it still
works.

Herdr gives mods a list of every terminal, with its parent and the word its program reports. For a
terminal without a pane, the list has no "seen" state. Koja can therefore tell working and blocked
apart for such a terminal, but not a finished turn the user has not looked at from one they have.

## Decision

Koja computes the status of each space and tab itself, in one shared function in the kit, and every
surface uses it instead of Herdr's status.

- Order is blocked, then working, then done, then idle. Blocked work needs the user now. Running
  work outranks an unseen finished turn, because a done mark on a space with running work reads as
  finished work that is not finished.
- An agent in a pane uses Herdr's status for that pane, done included.
- A terminal without a pane counts toward the tab of the nearest pane above it in the parent chain,
  at any depth. It counts only as blocked (`blocked` or `error`) or working. It never counts as done
  or idle, because Koja cannot read whether the user has seen it.

One function keeps the three surfaces in agreement, as [ADR 0004](./0004-separate-mods-one-kit.md)
requires for shared logic.

## Consequences

### Positive

- Blocked work takes priority over everything else in a space or tab.
- A space or tab shows done only after all work in it stops.
- The sidebar, tab bar, and picker cannot disagree about a status.

### Negative

- An unseen finished turn is hidden while any pane or sub-agent in the same space or tab works.
- A sub-agent's finished turn alone never shows a space or tab as done.
- Koja's status can differ from the status Herdr shows for the same space or tab.
- When Herdr exposes a full status for every terminal, this function should move to it, and this ADR
  must change.

## Alternatives considered

### Use Herdr's space and tab status

Keep reading the status Herdr gives each space and tab. Rejected because it ignores background
sub-agents.

### Change Herdr

Make Herdr roll up every terminal in the Herdr fork. Rejected because Koja would carry a Herdr
change it does not own. The request goes to Herdr upstream instead.

### Guess done for terminals without a pane

Treat a terminal without a pane as done when its turn is newer than the last turn Herdr recorded as
seen. Rejected because Herdr's seen state also lives in memory that mods cannot read, so the guess
would show wrong marks.
