# QA recipe: close and rename

Drive the close dialogs and the rename prompt in the sandbox the brief names. Follow
[the rules for every section](../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

Each key works from normal mode. Press `key b Control_L` to enter it.

| Entry point | Action                 |
| ----------- | ---------------------- |
| `w q`       | Close the focused pane |
| `t q`       | Close the tab          |
| `s q`       | Close the space        |
| `t r`       | Rename the tab         |
| `s r`       | Rename the space       |
| Elsewhere   | The same close dialogs |

"Elsewhere" is the palette, the menus, the tab's close button, and the pane header.

## Driving steps

1. Run `bun run sandbox shot <file>` and read the image to see the window.
2. Use one entry point.
3. Take a `shot`, and read the dialog or the prompt.
4. Cancel with `key Escape`, or click `Close` when the brief allows data writes.
5. Take a `shot`, and count the spaces, tabs, and panes.

## Observable results

- `w q` closes only the focused pane, with no dialog, when the pane has siblings.
- On the last pane of the last tab, the dialog is `Close space?` with the space name, tab count, and
  terminal count.
- `s q` always asks.
- `t q` asks only on the last tab of a space.
- `Escape` cancels, and every space, tab, and pane is still there.
- `Close` ends exactly what the dialog named.
- The same dialogs come from the palette, the menus, the tab's close button, and the pane header.
- `t r` and `s r` open a rename prompt. It holds the current name, or nothing for a tab or space
  with an automatic name.
- `Escape` keeps the name.
- An empty name brings the automatic name back.

## Gotchas

- A close and a rename are data writes. Follow the brief's `Data writes` line.
- A double click, such as the rename of a tab, is not testable. The sandbox input sends single
  clicks only.
- A pane close that also ends other panes is not testable. No fixture step makes a terminal with a
  live child terminal in another pane.
