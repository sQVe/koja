# QA recipe: picker

Drive the picker mod, `koja-picker`, in the sandbox the brief names. Follow
[the rules for every section](../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point       | Command                                               |
| ----------------- | ----------------------------------------------------- |
| Normal mode `s f` | `bun run sandbox key s`, then `bun run sandbox key f` |

Press `key b Control_L` first to enter normal mode.

## Driving steps

1. Run `bun run sandbox shot <file>` and read the image to see the window.
2. Open the picker, then take a `shot` before you type.
3. Type a query with `bun run sandbox type "<text>"`.
4. Change the filter with `key Tab` and `key Tab Shift_L`.
5. Go to the selected row with `key Return`, or close the picker with `key Escape`.

## Observable results

- `s f` opens the picker.
- A query filters, and `Tab` and shift-tab change the filter.
- `Return` goes to the row.
- `Escape` returns focus to the pane that had it.
- The picker preview follows the selection and types nothing into the source terminal.

## Gotchas

- Picker history is not a data write.
