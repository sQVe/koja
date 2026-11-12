# ADR 0014: Normal mode keeps the keyboard and forwards list keys to the marked section

**Date**: 2026-11-12\
**Status**: Accepted\
**Related**: [ADR 0012 (Normal mode gives each part of the app one plain letter)](./0012-one-plain-letter-per-part.md),
[ADR 0013 (Insert mode only types, and global keys are an allowlist)](./0013-insert-mode-only-types.md)

## Context

Normal mode drives panes, tabs, and spaces. The user also wants to move in the lists of the app,
such as the sidebar, with the same keys: `j`, `k`, `g g`, `G`, and `enter`. Those keys must then act
on the list instead of the panes, so the app needs to know which section the keys belong to.

`koja-modal` owns the keyboard while normal mode is on. It holds focus on its own overlay and takes
focus back after each action. A key that arrives while another surface has focus goes to that
surface, and when that surface is a terminal, the key is typed into the program in the pane.

The window uses `Tab` and `Shift-Tab` for its own tab stops, so they never arrive at a mod as raw
keys. A mod gets them only through a key binding in its own key section.

A mod command sent to a hidden mod fails with a visible error.

## Decision

`koja-modal` keeps the keyboard, marks one section in the shared store, and sends the list keys to
the marked section as mod commands.

The marked section is a shared value, because every mod draws again when a shared value changes. The
section draws the mark and runs the list commands. It never takes focus. The section with no mark
drawn is the panes, and there the list keys keep their pane and scroll meaning.

`Tab` and `Shift-Tab` step the mark through the shown sections. They are bound in the key section of
`koja-modal`, so they apply only while normal mode has focus and take no key from programs in panes.

The mark never rests on a hidden section. The step skips a hidden section, and `koja-modal` moves
the mark back to the panes when the marked section hides, before it sends any key.

The names the mods share, such as the store key, the sections, and the list commands, live in the
kit, because both the sender and each receiver must agree on them.

## Consequences

### Positive

- One mod owns the keyboard in normal mode, so no key reaches a terminal while focus moves.
- A section needs no focus handling. It reads one shared value and runs commands.
- A new section joins by adding its name and its mod to the kit.

### Negative

- Each list key is one mod command, so a section must run a command loop.
- A section cannot read keys itself. Every key a list needs must be a row in the kit's key table.
- `Tab` and `Shift-Tab` no longer step spaces. `s j` and `s k` do.

## Alternatives considered

### Give the section real focus

The marked section holds focus and reads its own keys. Rejected because it needs a second mode in
the code that holds the keyboard, key forwarding back to `koja-modal`, and a guard for clicks. Its
failures type keys into the terminal: after a space change the section lost focus for a short time,
and a key pressed in that gap reached the shell.

### Make the section a focus target with `"focusable": true`

Herdr then treats the section as a target of `pane.go`. Rejected because moving left at the window
edge lands on the sidebar, and the next move right does nothing. The `Tab` cycle needs no `pane.go`
target.
