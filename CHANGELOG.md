# koja

## 0.1.0

### Minor Changes

- [#30](https://github.com/sQVe/koja/pull/30)
  [`efaf560`](https://github.com/sQVe/koja/commit/efaf5601e64830f839c2bbcb143f78858bf3c810) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Koja's UI foundation to the kit: named text roles (view
  title, title, body, section heading, detail, and badge) in Regular and SemiBold only, a state line
  for empty, loading, and error states with an optional button or key hint, and a `circle-alert`
  icon. Small buttons inside rows grow from 14 to 16 px, key hints draw at 11 px, repository names
  in the sidebar draw in SemiBold instead of Bold, text fields draw at 13 px, and section header
  labels draw in SemiBold with the darker muted color. The Mock scenes mod gains the `states`,
  `popup`, and `controls` scenes, and the `sidebar` scene now matches the live sidebar. The kit
  gallery shows each state line kind with and without an action, stale rows under an error line, the
  16 px button, and a branch name cut in the middle.

- [#37](https://github.com/sQVe/koja/pull/37)
  [`d3efba7`](https://github.com/sQVe/koja/commit/d3efba7ed44dc792207a2212d1ac8d020c864d44) Thanks
  [@sQVe](https://github.com/sQVe)! - Show a failed PR-list or machine-list read as an error line in
  the sidebar, with a Retry button and the age of the last good read. Retry reads the failed
  resource at once, and the line stays until that resource reads again.

- [#5](https://github.com/sQVe/koja/pull/5)
  [`f51a400`](https://github.com/sQVe/koja/commit/f51a4003aad8c92661e2987d557710feab2035ae) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw tabs and the panel switcher as rounded pills inside the
  tab bar. The bar no longer draws a line under the tabs or between them, and its buttons are
  rounded too. Active and hovered tabs, spaces, and rows use a lighter gray, and the pane header is
  slimmer, with a faint divider.

- [#3](https://github.com/sQVe/koja/pull/3)
  [`06e57fe`](https://github.com/sQVe/koja/commit/06e57fe50cbf8e850b7711b4c90dc9f186413134) Thanks
  [@sQVe](https://github.com/sQVe)! - Use a new gray light theme, `catppuccin-latte-muted`, for
  every layout. Terminals have 4 px of vertical and 10 px of horizontal padding, and the first tab
  starts at the sidebar's edge unless the macOS window buttons need the room.

- [#8](https://github.com/sQVe/koja/pull/8)
  [`4599012`](https://github.com/sQVe/koja/commit/4599012378a0b858c11ab2a335869849afdd4ebe) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw each repository as one label row with its name, its
  branch, and the age of its last commit. The main checkout no longer has its own row, and selecting
  the label opens that checkout's space. A folded repository shows its label dimmed, with the count
  of hidden rows. The sidebar no longer draws the Spaces header, its + button, or folder icons, and
  selected rows are rounded pills. Labels use the small semibold text size, a gap sits above each
  repository group, and every space row shows its status dot before its title.

- [#3](https://github.com/sQVe/koja/pull/3)
  [`06e57fe`](https://github.com/sQVe/koja/commit/06e57fe50cbf8e850b7711b4c90dc9f186413134) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw each pane as a rounded card with a 6 px gap and a faint
  outline that turns blue on the focused pane. A new `koja-pane` header replaces Herdr's: it paints
  no background, so the card's rounded corners stay clean, and it shows the focused pane's title in
  full color and the others dimmer. The tab bar no longer draws minimize, maximize, and close
  buttons.

- [#8](https://github.com/sQVe/koja/pull/8)
  [`4599012`](https://github.com/sQVe/koja/commit/4599012378a0b858c11ab2a335869849afdd4ebe) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw Koja's panels, tabs, menus, and dialogs in Geist, one
  size step smaller than before. Terminals keep their own font.

- [#31](https://github.com/sQVe/koja/pull/31)
  [`8d29417`](https://github.com/sQVe/koja/commit/8d294177c2691ef700f80b7c2dfdd051d7835319) Thanks
  [@sQVe](https://github.com/sQVe)! - Show Koja's normal-mode keys as plain key hints in the
  palette, `koja-menu`, and `koja-new-menu`, such as `Ctrl+W V` for splitting a pane right. A
  `global` binding for the same action still wins.

- [#24](https://github.com/sQVe/koja/pull/24)
  [`2796f18`](https://github.com/sQVe/koja/commit/2796f1887b297ef73bd6074bc509f52fd086023c) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the Mock scenes mod. Open it, type a scene name, and press
  Enter to show that scene in a fixed window built from fake data. An unknown name shows an error
  that lists the known scenes.

- [#27](https://github.com/sQVe/koja/pull/27)
  [`8639153`](https://github.com/sQVe/koja/commit/8639153cbd849d5130a5a478356669b068fbc95c) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Koja's own confirm and prompt dialog parts to the UI kit:
  dialog buttons in solid, danger, and outline kinds, and a dialog frame on the rounded popup
  surface. The kit gallery shows a sample confirm and a sample prompt.

  Add the `koja-confirm` and `koja-prompt` mods, ports of Herdr's confirm and prompt dialogs drawn
  with those parts.

  Closing a space and renaming a space or tab now ask first in these dialogs. The space and tab
  menus, the palette, and a tab double-click open them. F2 and Shift-F2 no longer open Herdr's
  rename prompt, so Rename has no shortcut.

  Closing the last tab of a space closes the space, so it asks through the confirm too: from the tab
  bar, the tab menu, the palette, and normal mode's `ctrl-t q`. The dialog takes the keyboard, so
  Enter and Esc reach it and normal mode gets the keyboard back. The palette's Duplicate mod also
  opens Koja's prompt.

- [#1](https://github.com/sQVe/koja/pull/1)
  [`e70d4ed`](https://github.com/sQVe/koja/commit/e70d4edc9e2591b824320e76d287719022dfb006) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Koja's first mods: the spaces sidebar, the tab bar, the Go
  to picker, the command palette, the context menu, and the + menu, ported from the Herdr setup and
  drawn through one UI kit. A kit gallery shows every component. `bun run herdr:install` installs
  the mods, keys, settings, layout, and theme into Herdr's home as real files, and
  `bun run herdr:watch` installs on every save.

- [#43](https://github.com/sQVe/koja/pull/43)
  [`0bb0481`](https://github.com/sQVe/koja/commit/0bb04817204896675a65400bfed36b9021729d4b) Thanks
  [@sQVe](https://github.com/sQVe)! - In normal mode, `s f` and `ä` open the picker, and
  `space space` no longer does. The palette hint for the picker reads `s f`. Normal mode also tints
  the focused pane's header and draws its title and icon in the accent color, because Herdr draws no
  focus border while normal mode holds the keyboard.

- [#41](https://github.com/sQVe/koja/pull/41)
  [`723820d`](https://github.com/sQVe/koja/commit/723820d5cf672db605eef079d33472deda53bb1b) Thanks
  [@sQVe](https://github.com/sQVe)! - Give each part of the app one plain letter in normal mode: `w`
  for panes, `t` for tabs, `s` for spaces, `g` to go to a place, and `z` for the view. Splitting
  right is now `w v`, a new tab is `t n`, `t 1` to `t 9` select a tab, `s n` makes a space, `z s`
  toggles the sidebar, and `z l` switches the layout. Plain `h/j/k/l` and the arrow keys move
  between panes, `H/J/K/L` swap them, `:` opens the palette, `/` leaves normal mode and searches the
  terminal, and `?` opens help. `ctrl-w` keys still work. The `ctrl-t` and `ctrl-q` keys are gone,
  and so is the agent jump: `alt-down`, `alt-up`, and the Next and Previous agent palette entries.
  Key hints in the palette and menus now show the normal-mode key, such as `W V` for splitting
  right.

  The palette's Next space and Previous space now step through spaces in the order the sidebar
  shows, the same as `s j` and `s k`.

- [#14](https://github.com/sQVe/koja/pull/14)
  [`fadadb6`](https://github.com/sQVe/koja/commit/fadadb6692f7989da23ee4ba23a59b2819137453) Thanks
  [@sQVe](https://github.com/sQVe)! - Port the Changes panel to a Koja mod drawn through the UI kit.

- [#6](https://github.com/sQVe/koja/pull/6)
  [`189acd7`](https://github.com/sQVe/koja/commit/189acd7d8d86c46c508791ee2bca0bec2cc8736f) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Koja's own normal mode. `ctrl-b` opens an invisible
  `koja-modal` overlay that holds the keyboard, and the Neovim key table drives panes, tabs, spaces,
  agents, the palette, and the picker. Normal mode stays open after a command, `i`, `a`, and `Enter`
  return to the pane, and the `koja-tabs` mode dot shows while it is open. It replaces the personal
  `modal` and `modal-pill` mods.

- [#30](https://github.com/sQVe/koja/pull/30)
  [`efaf560`](https://github.com/sQVe/koja/commit/efaf5601e64830f839c2bbcb143f78858bf3c810) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw every mod's text through the kit's text roles. The kit
  drops the medium row height, the empty state helper, and the medium font weight, and a check now
  fails when a mod sets a text size or weight itself. Menu and Changes rows shrink from 26 to 24 px,
  and gallery popup rows grow from 26 to 28 px.

- [#17](https://github.com/sQVe/koja/pull/17)
  [`cecca4f`](https://github.com/sQVe/koja/commit/cecca4fba92b5372a197f2d4a00528b8d12e7d10) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the repository name that heads each group in the spaces
  sidebar in bold. Koja now installs Geist SemiBold and Bold, because Herdr bundles only Geist
  Regular, so semibold and bold text draws in its real weight.

### Patch Changes

- [#33](https://github.com/sQVe/koja/pull/33)
  [`c684535`](https://github.com/sQVe/koja/commit/c684535af84a59e6402cd0ef8632de0b64a82005) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the previous Changes list when a refresh fails, show a
  stale line with its age and a Retry, and disable Commit until the same repository reads again. A
  failed first read and a failed folder watch now show their own error lines. A file change during a
  read now starts another read before Commit turns on, so Commit never stages files the list does
  not show. The Changes list draws its text and rows through the kit.

- [#4](https://github.com/sQVe/koja/pull/4)
  [`2b1aace`](https://github.com/sQVe/koja/commit/2b1aaceeab2462f12bf02e571d8e599279ff7ad1) Thanks
  [@sQVe](https://github.com/sQVe)! - Round the backgrounds of the command palette, the terminal
  menu, and the new tab menu to Herdr's popup frame, so their corners no longer show a square dot.

- [#21](https://github.com/sQVe/koja/pull/21)
  [`b7f3f34`](https://github.com/sQVe/koja/commit/b7f3f34674ee6043683dab13b628f94bb8144bef) Thanks
  [@sQVe](https://github.com/sQVe)! - Name an unnamed tab whose terminals all carry a Tau task by
  that task. A tab with one worker shows its task, and a tab with several shows the first task and a
  count of the others, such as "Fix status counts +2". The tab bar and the picker both use the new
  name, and the picker search matches it.

- [#28](https://github.com/sQVe/koja/pull/28)
  [`feec883`](https://github.com/sQVe/koja/commit/feec883c396a4a1d8384335dbd5819e6592057e8) Thanks
  [@sQVe](https://github.com/sQVe)! - Split the kit gallery code by section. The mods do not change;
  only the gallery's own source moves into one module per section.

- [#4](https://github.com/sQVe/koja/pull/4)
  [`2b1aace`](https://github.com/sQVe/koja/commit/2b1aaceeab2462f12bf02e571d8e599279ff7ad1) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the selected row in the terminal menu when Git actions
  load, instead of moving the highlight to a different entry.

- [#16](https://github.com/sQVe/koja/pull/16)
  [`31ae3fd`](https://github.com/sQVe/koja/commit/31ae3fd07c528deaf7749aea94a59406e925d25f) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The tests now share one fake for each
  Herdr module and run in parallel without isolation, so they pass in any file order and in mutation
  runs.

- [#26](https://github.com/sQVe/koja/pull/26)
  [`1af6af4`](https://github.com/sQVe/koja/commit/1af6af444896698747f3ccf2da112d2297769cfd) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode scrolls the focused pane's history with Neovim's
  keys: `ctrl-u` and `ctrl-d` for half a page, `ctrl-b` and `ctrl-f` for a page, `ctrl-y` and
  `ctrl-e` for a line, and `gg` and `G` for the top and bottom.

- [#32](https://github.com/sQVe/koja/pull/32)
  [`551acee`](https://github.com/sQVe/koja/commit/551acee8a447839ddb66530e2e49551bf95f1256) Thanks
  [@sQVe](https://github.com/sQVe)! - The `catppuccin-latte-muted` theme's text and status marks now
  meet WCAG 2.2 AA contrast. The "Needs you" badge label draws in the dark foreground color. The
  diff hunk header, the diff line numbers, and the disabled action button label use the darker muted
  color. A hovered solid or danger button draws a ring instead of fading its fill and label.

- [#15](https://github.com/sQVe/koja/pull/15)
  [`1f7d2bf`](https://github.com/sQVe/koja/commit/1f7d2bfa9f36b7cfbb38ac2ae6ec1ee7b61df8a2) Thanks
  [@sQVe](https://github.com/sQVe)! - Mark sidebar spaces with no agent with a hollow ring in their
  status slot, in full rows and in the narrow rail.

- [#11](https://github.com/sQVe/koja/pull/11)
  [`985fd29`](https://github.com/sQVe/koja/commit/985fd290bf97fd97ee371543c008886d56841932) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode moves between panes with the arrow keys, alone or
  after `ctrl-w`, the same as `ctrl-h/j/k/l` and `ctrl-w h/j/k/l`.

- [#40](https://github.com/sQVe/koja/pull/40)
  [`a4d2791`](https://github.com/sQVe/koja/commit/a4d27912ab804f2fad647a836040d355cb731f57) Thanks
  [@sQVe](https://github.com/sQVe)! - Add two mock scenes of Koja's chosen visual direction,
  `direction-koja` for insert mode and `direction-koja-normal` for normal mode. They draw the whole
  window from their own set of colors and sizes. Pane headers in the shell scene now show the branch
  and the folder together.

- [#38](https://github.com/sQVe/koja/pull/38)
  [`df34dd6`](https://github.com/sQVe/koja/commit/df34dd6462597ef63190f3307362d7fbad115855) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the kit's pane header part, a pane header menu, an
  icon-only toggle, and a mode pill. The pane header draws a program icon, name, task, branch, and
  folder, reveals its split, zoom, and close buttons on header hover while keeping their space, and
  shows the branch and folder in full while they fit. A field that no longer fits cuts in the middle
  down to a minimum width, then drops whole in order (folder, then branch) before the task cuts.
  Once a field drops, or below a compact width, it swaps the four buttons for one visible overflow
  button whose menu lists the task, branch, and folder above the four actions. Header buttons and
  icon-only toggles carry accessible names beside their tooltips, the focused header draws a
  kit-owned focus fill, and the status mark draws done as a green check icon. Add the `shell` and
  `pane-headers` mock scenes, which draw the window shell and the header states from those parts.

- [#17](https://github.com/sQVe/koja/pull/17)
  [`cecca4f`](https://github.com/sQVe/koja/commit/cecca4fba92b5372a197f2d4a00528b8d12e7d10) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep letter spacing even in search results. Highlighted
  matches in the palette and picker no longer open small gaps inside words.

- [#29](https://github.com/sQVe/koja/pull/29)
  [`23a4751`](https://github.com/sQVe/koja/commit/23a47518bb6b9c3f45a1f81ad9dc97a3fcf306ed) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The sidebar, Changes, and picker mods
  now keep their drawing, data reads, and preview loading in modules beside `main.ts`.

- [#22](https://github.com/sQVe/koja/pull/22)
  [`3a87eaa`](https://github.com/sQVe/koja/commit/3a87eaa8e123132ecfae290b7b2f7c6e573d6d2c) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode moves between panes with Ctrl and an arrow key,
  the same as `ctrl-h/j/k/l`.

- [#10](https://github.com/sQVe/koja/pull/10)
  [`6b5ce04`](https://github.com/sQVe/koja/commit/6b5ce047b109711ea073ba684ab8d6f3a0c92580) Thanks
  [@sQVe](https://github.com/sQVe)! - Fix normal mode losing the keyboard after it moves focus. A
  pane, tab, or space action now takes the keyboard back as soon as Herdr applies the move, so the
  next key reaches normal mode instead of the terminal. A loss normal mode did not cause keeps the
  status check, but a `toast` no longer blocks it, lookups back off while another overlay stays
  open, stale replies are dropped, and a reply without an overlay list keeps the current keyboard
  owner. When a palette or picker closes, normal mode checks the keyboard owner at once instead of
  waiting out the backoff.

- [#11](https://github.com/sQVe/koja/pull/11)
  [`985fd29`](https://github.com/sQVe/koja/commit/985fd290bf97fd97ee371543c008886d56841932) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode accepts Neovim's ctrl versions of the `ctrl-w`
  keys, such as `ctrl-w ctrl-v` to split right and `ctrl-w ctrl-w` to move to the next pane.
  `ctrl-w ctrl-c` cancels, as in Neovim.

- [#7](https://github.com/sQVe/koja/pull/7)
  [`675f1a2`](https://github.com/sQVe/koja/commit/675f1a27cca46b4ae5b558f1362165ca51bed72c) Thanks
  [@sQVe](https://github.com/sQVe)! - Show a space or tab as working while a sub-agent inside it is
  running. Koja now computes the status for the sidebar, tab bar, and picker with one shared rollup:
  blocked, then working, then done, then idle. It counts working and blocked sub-agents that have no
  pane, at any depth, so a parent's finished state no longer hides running work.

- [#18](https://github.com/sQVe/koja/pull/18)
  [`f1a60fe`](https://github.com/sQVe/koja/commit/f1a60fe8cdaf4b50bcb4c2a0bbdde5bed1ffc312) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. Tests now cover the menu, modal,
  palette, palette color, and picker (rows, matching, and preview) paths that mutation testing found
  uncovered.

- [#37](https://github.com/sQVe/koja/pull/37)
  [`d3efba7`](https://github.com/sQVe/koja/commit/d3efba7ed44dc792207a2212d1ac8d020c864d44) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the tab bar, pane headers, and sidebar rows through the
  kit's text roles, 24 px rows, and hover rule. Tab icons take the tab's text color, and repository
  branch names cut in the middle so the branch and age stay readable.

- [#43](https://github.com/sQVe/koja/pull/43)
  [`0bb0481`](https://github.com/sQVe/koja/commit/0bb04817204896675a65400bfed36b9021729d4b) Thanks
  [@sQVe](https://github.com/sQVe)! - The pane header's split, zoom, and close buttons now show a
  tooltip and carry an accessible name.

- [#9](https://github.com/sQVe/koja/pull/9)
  [`c48dd81`](https://github.com/sQVe/koja/commit/c48dd810f5044c8084bc65b300f95a5aa2072cb8) Thanks
  [@sQVe](https://github.com/sQVe)! - Name tabs in the Go to panel the same way as the tab bar. An
  unnamed tab shows the program it runs, such as `tuicr`, instead of `Tab 1 · <pane title>`, and its
  icon comes from that program too.

- [#13](https://github.com/sQVe/koja/pull/13)
  [`8d7f4b8`](https://github.com/sQVe/koja/commit/8d7f4b8e080f17db5a2252d9a2a89520e92538e3) Thanks
  [@sQVe](https://github.com/sQVe)! - Make Tab and Shift-Tab in normal mode step through the spaces
  in the order the sidebar shows, wrapping at both ends. Spaces hidden in a folded repository or a
  folded machine are skipped. When the sidebar order is not known, Tab and Shift-Tab still run
  Herdr's next and previous space.

- [#25](https://github.com/sQVe/koja/pull/25)
  [`2c62b7a`](https://github.com/sQVe/koja/commit/2c62b7a4a54389953dcd525de154440221a8a4cc) Thanks
  [@sQVe](https://github.com/sQVe)! - Add four palette smoke scenes to the Mock scenes mod, used to
  check the judge-mock skill.
