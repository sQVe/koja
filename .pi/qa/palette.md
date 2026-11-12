# QA recipe: command palette

Drive the command palette mod, `koja-palette`, in the sandbox the brief names. Follow
[the rules for every section](../qa.md#rules-for-every-section) of the QA guide first. They name the
sandbox, point to `ruta guide`, prove the sandbox, and list what never to run.

## Entry points

Each entry point opens the palette from normal mode (`koja-modal`). Press `ctrl-b` to enter normal
mode.

| Entry point             | Command                                                     |
| ----------------------- | ----------------------------------------------------------- |
| Normal mode `:`         | `bun run sandbox type ":"`                                  |
| Normal mode `backspace` | `bun run sandbox key BackSpace`                             |
| Normal mode `ö`         | None in the sandbox. Report it as not verified; see gotchas |

Use `type ":"`, not `key colon`: `key` does not add Shift.

## Driving steps

1. Run `bun run sandbox shot <file>` and read the image to see the window.
2. When normal mode is off, run `bun run sandbox key b Control_L` to enter it. Then run the entry
   point's command. Normal mode stays on after the palette closes, so skip `ctrl-b` for the next
   entry point.
3. Wait one second, then type a query with `bun run sandbox type "<text>"`.
4. Clear the query with `key BackSpace`, once per letter.
5. Move the selection with `bun run sandbox key <keysym>`: `Down`, `Up`, `Page_Down`, or `Page_Up`.
   Keysyms are case sensitive; `down` fails.
6. Turn the wheel over the list with `scroll <x> <y> <notches>`, down for a positive count.
7. Run the selected entry with `key Return`, or click its row with `click <x> <y>`. This closes the
   palette.
8. Open the palette again, then close it without running an entry with `key Escape`.
9. Leave normal mode with `key i` when the run is done.

Take a `shot` after each step that should change the screen.

## Observable results

- An empty query shows grouped sections in this order: Recent, Tab, Pane, Space, Layout, Terminal,
  Agent, Window, App. A section with no entries does not show.
- The list is 12 rows tall. Section headers take part of that height, so fewer rows show when
  headers are in view. `Down` past the last shown row scrolls the list. `Page_Down` and `Page_Up`
  move the selection 12 rows. The wheel scrolls the list and moves the selection into view.
- A query shows fuzzy matches without section headers. The matched letters are highlighted, and the
  group name shows at the right side of the row.
- A row with a key binding shows its shortcut at the right side, such as `Z +` for Zoom in.
- A query with no match shows `Nothing matches "<query>". Places are in the picker.`
- Running an entry, by `Return` or by a click, closes the palette and runs its command.
- Stored value: running an entry moves it to the top of Recent, which shows at most 5 entries. To
  read the stored value through a second, read-only view, open the palette again with an empty query
  and read the Recent section.

## Gotchas

- Use harmless entries to test Recent, such as `Zoom in` and then `Reset zoom`. Never run
  `Quit Herdr`, `Close window`, `Reset to the default screen`, `Duplicate mod`, or
  `Duplicate layout`. They end the sandbox or write files.
- Recent keeps entries from earlier runs in the same sandbox. Read Recent before you run an entry,
  and compare it with Recent after the run.
- Normal mode stays on after the palette closes. Press the next entry point key directly. A second
  `ctrl-b` in normal mode scrolls the terminal and can show a `terminal.scroll failed` toast.
- The sandbox keyboard is a US layout, so `key odiaeresis` and `type "ö"` fail with an Xlib error.
  Do not verify `ö` through another entry point; report it as not verified.
- The palette takes focus again about 600 ms after it opens. Wait a second before you type.
- Close, rename, and some other commands open a confirm or rename dialog after `Return`. That is
  expected. Press `Escape` to cancel it.
- A fresh sandbox has no space open. The palette works without one, but commands that need a
  terminal, such as scrolling, fail with a toast.
- A row under the pointer shows a hover outline. It is not the selection; the selection has a filled
  background.
