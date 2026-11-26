# Close and rename

Target: sandbox

Drive the close dialogs and the rename prompt in the sandbox the brief names. Follow
[the rules for every section](../../qa.md#rules-for-every-section) of the QA guide first.

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
4. In a close dialog, cancel with `key Escape`. When the brief allows data writes, click `Close` or
   press `key Return`.
5. In a rename prompt, cancel with `key Escape`. When the brief allows data writes, clear the name
   with `key BackSpace`, once per letter. Type a new name with `bun run sandbox type "<name>"`, then
   run `key Return` or click `Save`. Repeat once with an empty name.
6. Take a `shot`, and count the spaces, tabs, and panes, or read the new name.

## Observable results

- `w q` closes only the focused pane, with no dialog, when its sibling panes are independent. A pane
  whose close also ends child panes asks first, and the dialog names the other panes that close.
- On the last pane of the last tab, the dialog is `Close space “<name>”?`. Its body names the agents
  that stop and the number of tabs that close, then says the folder, uncommitted changes, and branch
  stay. A space with no agent names only its tabs.
- The card has the overlay surface, a red `triangle-alert` before the title, a red `Close ↵` main
  button, and a plain `Cancel` button.
- `s q` always asks.
- `t q` asks only on the last tab of a space.
- `Return` runs the main action, and `Escape` cancels, in both insert and normal mode.
- `Escape` cancels, and every space, tab, and pane is still there.
- `Close` ends exactly what the dialog named.
- The same dialogs come from the palette, the menus, the tab's close button, and the pane header.
- `t r` and `s r` open a rename prompt. It holds the current name, or nothing for a tab or space
  with an automatic name.
- `Escape` keeps the name.
- An empty name brings the automatic name back.

## End state

The tester names the dialog each entry point opened, and says whether `Escape` kept the space, tab,
or pane. With data writes allowed, the closed item is gone and the renamed one shows its new name.

## Gotchas

- A close and a rename are data writes. Follow the brief's `Data writes` line.
- A double click, such as the rename of a tab, is not testable. The sandbox input sends single
  clicks only.
- A pane close that also ends other panes is not testable. No fixture step makes a terminal with a
  live child terminal in another pane.
