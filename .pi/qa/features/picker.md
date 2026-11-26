# Picker

Target: sandbox

Drive the picker mod, `koja-picker`, in the sandbox the brief names. Follow
[the rules for every section](../../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point       | Command                                               |
| ----------------- | ----------------------------------------------------- |
| Normal mode `g p` | `bun run sandbox key g`, then `bun run sandbox key p` |

Press `key b Control_L` first to enter normal mode.

## Driving steps

1. Run `bun run sandbox shot <file>` and read the image to see the window.
2. Open the picker, then take a `shot` before you type.
3. Read the chip line under the search line, and the preview header over the terminal.
4. Type a query with `bun run sandbox type "<text>"`.
5. Change the filter with `key Tab` and `key Tab Shift_L`, and by clicking a chip.
6. Go to the selected row with `key Return`, or close the picker with `key Escape`.

## Observable results

- `g p` opens the picker as one card: the search line, a chip per status with its count of spaces, a
  `Spaces` heading, the rows, and a footer with `tab` and `↵`.
- Each space row draws its agent mark, the space name, the project, and one work icon.
- The preview header names the selected row's space, pane, whole branch, and pull request, and the
  terminal below it follows the selection.
- A query filters, and `Tab`, shift-tab, and a chip click change the filter.
- `Return` goes to the row.
- `Escape` returns focus to the pane that had it.
- The picker preview types nothing into the source terminal.
- When the preview cannot start, the picker stays open on an error line with Retry.

## End state

The tester names the row the query left and the filter each `Tab` press showed. `Escape` returned
focus to the pane that had it.

## Gotchas

- Picker history is not a data write.
