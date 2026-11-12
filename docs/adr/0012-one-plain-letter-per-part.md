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

Koja chooses normal-mode keys by this procedure, giving each part one plain letter and keeping
Neovim's keys where they fit.

1. Find the action's part: `w` `t` `s` `g` `z`. A new letter only when no part fits.
2. If Neovim has a key for the same action on the same kind of thing, use it under the part letter,
   without `ctrl`.
3. Otherwise pick a second key by its name in English, the same across parts: `n` new, `q` close,
   `r` rename.
4. Add a one-key alias only when the user repeats the action in a row or does it many times in a
   session. Use a free key whose Vim meaning needs a cursor. One alias per action.
5. Never change these keys: `h j k l`, `gg` `G`, `/`, digits as counts, `gt` `gT`, `ctrl-w`, `i`,
   `Escape`, `:`, `?`.
6. A key steps only through an order the user can see on screen.
7. A marked section adds no keys beyond the list keys `j` `k` `gg` `G` `ctrl-d` `ctrl-u` `Enter`.
   See [ADR 0014](./0014-normal-mode-forwards-list-keys.md).
8. Every key, alias included, is a row in the kit's table.

### Parts

- `w`: windows, which are panes. Its second keys are Neovim's `ctrl-w` keys.
- `t`: tabs.
- `s`: spaces.
- `g`: go to or open a place in the UI. Neovim's `gg`, `gt`, and `gT` stay here. Each new place,
  such as Changes or a side panel, gets a letter under `g` when it is built.
- `z`: view, such as the sidebar, the layout, and font zoom.

### Single keys and aliases

The bracket family serves repeated moves: `]` `[` step spaces, `)` `(` step tabs, and `}` `{` go to
the main space of the next and previous repository. Plain `h/j/k/l` move between panes because no
cursor needs them. `H/J/K/L` give repeated pane swaps one alias each. `Space` goes to the next pane
that needs you, as the one-key alias of `g a`, because the user repeats this jump more than any
other.

Keys fixed by step 5 are not exceptions. `:` opens the palette, `/` searches, and `?` opens help, as
in Neovim. `/` leaves normal mode, as Vim's `/` leaves normal mode for the command line. Herdr gives
no signal when its find bar closes, so normal mode cannot know when to take the keyboard back. Help
is an overlay Koja can see, so normal mode waits while Help is open and then takes the keyboard
back. `ctrl-w` sequences stay as aliases of `w`, so Neovim muscle memory still works.

Step 2 accepts the nearest Neovim action with the same purpose, including the `ctrl-w` second keys
under `w`. A digit or symbol can name an action in step 3, such as `t 1` or `z +`. A jump to the
last-used pane or tab does not step through an order, so step 6 does not apply to it.

Hints in the palette and menus show the form with the fewest keys, which is the one-key alias when
an action has one.

### Exceptions

- `}` `{` break step 1: they have no part-letter form, keeping repository moves in the bracket
  family.
- `t h` `t l` break steps 2 and 3: direction letters keep tab moves aligned with left and right.
- `s j` `s k` break step 3: direction letters follow the sidebar's vertical space list.
- Arrow keys, `ctrl-h/j/k/l`, and Ctrl-arrow keys break step 4: extra pane-move aliases keep
  familiar direction keys.
- `Backspace` and `ö` break step 4: extra palette aliases ease access; `ö` is a layout alias, not a
  Vim cursor key.
- `ä` breaks step 4: the picker has a layout alias, not a Vim cursor key.
- `a` and `Enter` break step 4: both alias `i` to make returning to typing easy.
- `Tab` `Shift-Tab` break step 1: they have no part;
  [ADR 0014](./0014-normal-mode-forwards-list-keys.md) owns this choice.
- `ctrl-u/d/b/f/y/e` break steps 1 and 2: scrolling keeps Neovim's chords without a part-letter
  form.
- `w w` `w W` break step 6: they keep Neovim's pane cycle in Herdr's pane order, which is not shown.
- `z l` breaks step 6: it keeps layout cycling even though the layout order is not shown.

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

### Neovim-style bracket pairs

Use pairs such as `]s` to step spaces. Rejected because a bare `]` cannot exist next to `]s` without
a timeout. The bracket family keeps repeated moves to one key without waiting.

### Keep normal mode paused during a search

Keep normal mode open after `/`, and take the keyboard back when the find bar closes. Rejected
because Herdr gives no signal for that, and taking the keyboard back too early turns search text
into normal-mode keys.

### One leader key for everything

Put every action under one leader, such as `space`. Rejected because every action then costs an
extra key, and the leader would hold unrelated parts without a pattern.
