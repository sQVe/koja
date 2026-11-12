# ADR 0012: Normal mode gives each part of the app one plain letter

**Date**: 2026-11-06\
**Status**: Accepted

## Context

Koja's normal mode lets the user drive panes, tabs, and spaces from the keyboard. Its users know
Neovim, so keys they already know cost them nothing to learn.

Neovim puts window keys behind `ctrl-w` because its plain letters move the cursor. Koja's normal
mode has no cursor, so most plain letters are free. Copying Neovim's Ctrl chords, and inventing more
of them for tabs and spaces, makes keys harder to type without a reason.

Koja will also grow places to open, such as a Changes view or side panels. They need keys that fit
one pattern instead of a new chord each.

## Decision

Normal-mode keys feel familiar to a Neovim user but are never harder to type than they need to be.
Koja keeps Neovim's letters, drops Ctrl where nothing needs it, and gives each part of the app one
plain letter. The second keys under that letter are Neovim's where Neovim has them.

### Parts

- `w`: windows, which are panes. Its second keys are Neovim's `ctrl-w` keys.
- `t`: tabs.
- `s`: spaces.
- `g`: go to or open a place in the UI. Neovim's `gg`, `gt`, and `gT` stay here. Each new place,
  such as Changes or a side panel, gets a letter under `g` when it is built.
- `z`: view, such as the sidebar, the layout, and font zoom.

A new part of the app gets its own letter only when it does not fit under one of these.

### Single keys and aliases

- Plain `h/j/k/l` and the arrow keys move between panes, because no cursor needs them. While a
  section with a list is marked, `j` and `k` move its cursor instead; see
  [ADR 0014](./0014-normal-mode-forwards-list-keys.md).
- `:` opens the palette, `/` searches, and `?` opens help, as in Neovim.
- `/` leaves normal mode, as Vim's `/` leaves normal mode for the command line. Herdr gives no
  signal when its find bar closes, so normal mode cannot know when to take the keyboard back. Help
  is an overlay Koja can see, so normal mode waits while Help is open and then takes the keyboard
  back.
- `ctrl-w` sequences stay as aliases of `w`, so Neovim muscle memory still works.
- `Space` goes to the next pane that needs you, as the one-key alias of `g a`, because the user
  repeats this jump more than any other.
- Key hints in the palette and menus show the plain-letter form, so users learn the short keys.

Koja moves between items only in an order the user can see on screen. A key that steps through a
hidden order, such as agents with no agent list, does not belong in normal mode.

## Consequences

### Positive

- Most actions take two plain keys and no chord.
- Each part has one letter to remember, and new places fit under `g` without new prefixes.
- Neovim users keep their `ctrl-w` keys.

### Negative

- Plain letters that start a part, such as `s` and `t`, cannot be single-key actions.
- Some keys differ from Neovim, such as `s` for spaces instead of substitute.
- Hints show one key per action, so the `ctrl-w` aliases stay unlisted.
- After a search, the user presses the normal-mode key again to return.

## Alternatives considered

### Keep Neovim's Ctrl prefixes

Keep `ctrl-w` for panes and add Ctrl prefixes for tabs and spaces. Rejected because Koja has no
cursor that takes the plain letters, so the chords only make keys harder to type.

### Keep normal mode paused during a search

Keep normal mode open after `/`, and take the keyboard back when the find bar closes. Rejected
because Herdr gives no signal for that, and taking the keyboard back too early turns search text
into normal-mode keys.

### One leader key for everything

Put every action under one leader, such as `space`. Rejected because every action then costs an
extra key, and the leader would hold unrelated parts without a pattern.
