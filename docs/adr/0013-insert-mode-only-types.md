# ADR 0013: Insert mode only types, and global keys are an allowlist

**Date**: 2026-11-06\
**Status**: Accepted\
**Related**: [ADR 0012 (Normal mode gives each part of the app one plain letter)](./0012-one-plain-letter-per-part.md),
which sets how normal-mode keys are laid out

## Context

Koja has two keyboard modes. In normal mode, plain keys drive panes, tabs, spaces, and the places of
the app. In insert mode, keys go to the program in the focused pane.

A global key works in both modes, so Koja takes it before the program sees it. Each global chord is
a key that Neovim, less, the shell, or another program in a pane can no longer use. Chords such as
`alt-h` or `ctrl-shift-k` are common in those programs, so every global chord can break a program
the user runs inside Koja.

Normal mode, the palette, and the picker already reach every action the chords ran. A global chord
for the same action only adds a second way that costs a key inside every pane.

## Decision

Normal mode is the main keyboard interface, and insert mode only types.

Global keys are an allowlist kept for actions the user does all the time. Today the only global key
is `ctrl-b`, which enters normal mode. A new global key is added on purpose, one at a time, and only
when the action is done so often that the extra normal-mode key costs more than the key it takes
from programs.

Terminal keys that edit text or copy and paste, such as `ctrl-left` or `ctrl-shift-v`, are a
separate allowlist. They make the terminal itself behave as users expect and do not run Koja
actions.

Keys inside a mod, such as the picker's `tab`, stay with that mod. They only apply while the mod has
focus, so they do not take keys from programs in panes.

## Consequences

### Positive

- Programs in panes get every key except `ctrl-b` and the terminal editing keys.
- Users learn one set of keys, the normal-mode keys, instead of a chord set next to them.
- A test fails when a global key is added outside the allowlist, so the choice stays deliberate.

### Negative

- Inside Koja, programs such as Neovim, less, the shell's emacs keys, and tmux never get `ctrl-b`.
- Actions that took one chord, such as moving between panes, now take `ctrl-b` and then a key.
- Going to space N has no key, so the user picks the space in the picker.

## Alternatives considered

### Keep the full set of chords

Keep global chords for panes, tabs, spaces, zoom, and the picker next to normal mode. Rejected
because each chord takes a key from every program in a pane, and normal mode already reaches the
same actions.

### Use another entry key that programs rarely use

Enter normal mode with a key that few programs bind, such as a function key or a rare chord, so that
`ctrl-b` stays free for programs. Rejected because a rare key is harder to reach, and the user
presses this key all the time.
