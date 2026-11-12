# QA recipe: normal mode keys

Drive normal mode, from the mod `koja-modal`, in the sandbox the brief names. Follow
[the rules for every section](../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point | Command                           |
| ----------- | --------------------------------- |
| Normal mode | `bun run sandbox key b Control_L` |

## Driving steps

1. Run `bun run sandbox shot <file>` and read the image to see the window.
2. When normal mode is off, run the entry point's command. Check this again before each group,
   because some keys leave normal mode.
3. Send the keys of one group below. Use `key` or `type` as the rules for every section say.
4. Take a `shot` after each key that should change the screen.
5. When the run is done, take a `shot`. Leave normal mode with `key i` only when it is still on.

## Observable results

Enter and leave:

- `key b Control_L` enters normal mode, and the focused pane header gets its tint.
- `i`, `a`, or `Return` leaves it, and the terminal takes typed text again.

Panes:

- `h` `j` `k` `l` and the arrows move focus.
- `H` `J` `K` `L` swap panes.
- `w v` and `w s` split.
- `w m` zooms and restores.
- `w w` and `w W` step through the panes of the tab.

Tabs, spaces, and the sidebar:

- `t n` opens a tab.
- `t h`, `t l`, `t 1` to `t 9`, and `g t` select tabs.
- `s j` and `s k` step spaces in sidebar order.
- `z s` hides and shows the sidebar.

Bracket keys:

- `type ']'` and `type '['` step spaces as `s j` and `s k` do.
- `type ')'` and `type '('` step tabs.
- `type '}'` and `type '{'` select the main space of the next and previous repository row of the
  sidebar, and wrap at the ends. With no repository row, they do nothing.
- The palette shows `]` as the key of "Next space" and `)` as the key of "Next tab".

The sidebar mark:

- `key Tab` and `key Tab Shift_L` move the mark between the sidebar and the panes.
- A marked sidebar shows a 1 px accent outline on its cursor row, and the panes show no mark.
- `Escape`, `i`, and a hidden sidebar drop the mark.

With the sidebar marked:

- `j` and `k` move the outline one row.
- `g g` and `G` go to the first and last row.
- `key d Control_L` and `key u Control_L` move half the rows that fit the list.
- `key Return` selects the space of the outline row and keeps normal mode on.
- No key types into the terminal.

Overlays:

- Normal mode stays on after a dialog, the palette, or the picker closes.
- `/` opens terminal search and leaves normal mode.
- `?` opens Koja's key help. A query filters its rows.
- `Escape` closes the help and keeps normal mode on. `s j` then changes the space.

## Gotchas

- `key` adds no Shift. Use `type` for `?` and capital letters, `key slash` for `/`, and
  `key Tab Shift_L` for shift-tab.
- The sandbox keyboard cannot type the `ö` and `ä` keys of normal mode. Report them as not verified.
