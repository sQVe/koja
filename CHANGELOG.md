# koja

## 0.1.0

### Minor Changes

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

- [#75](https://github.com/sQVe/koja/pull/75)
  [`e51a19e`](https://github.com/sQVe/koja/commit/e51a19ef63ac1956623e454c5573369b08740357) Thanks
  [@sQVe](https://github.com/sQVe)! - End each sidebar space row whose agent is not working with a
  dim age, including the project header that stands for the main space. A blocked or done space
  counts from when it entered that state, and an idle space or one without an agent counts from when
  you last showed it. The shown space and working spaces have no age. Koja saves these times, so the
  ages stay after a restart.

- [#30](https://github.com/sQVe/koja/pull/30)
  [`efaf560`](https://github.com/sQVe/koja/commit/efaf5601e64830f839c2bbcb143f78858bf3c810) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw every mod's text through the kit's text roles. The kit
  drops the medium row height, the empty state helper, and the medium font weight, and a check now
  fails when a mod sets a text size or weight itself. Menu and Changes rows shrink from 26 to 24 px,
  and gallery popup rows grow from 26 to 28 px.

- [#14](https://github.com/sQVe/koja/pull/14)
  [`fadadb6`](https://github.com/sQVe/koja/commit/fadadb6692f7989da23ee4ba23a59b2819137453) Thanks
  [@sQVe](https://github.com/sQVe)! - Port the Changes panel to a Koja mod drawn through the UI kit.

- [#80](https://github.com/sQVe/koja/pull/80)
  [`a8ca9b5`](https://github.com/sQVe/koja/commit/a8ca9b56dc92639c25d7d1d9cfed1e177361f50d) Thanks
  [@sQVe](https://github.com/sQVe)! - Start the data layer in the spaces sidebar. Each sidebar copy
  claims the data lease, renews its heartbeat every 10 seconds, and publishes the empty snapshot
  while it owns the lease. A copy that stops renewing, such as after a reload, is taken over once
  its heartbeat is 30 seconds old. The kit gallery shows a Data layer section with the owner,
  generation, revision, heartbeat age, and whether the snapshot is live, stale, or unavailable.

- [#1](https://github.com/sQVe/koja/pull/1)
  [`e70d4ed`](https://github.com/sQVe/koja/commit/e70d4edc9e2591b824320e76d287719022dfb006) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Koja's first mods: the spaces sidebar, the tab bar, the Go
  to picker, the command palette, the context menu, and the + menu, ported from the Herdr setup and
  drawn through one UI kit. A kit gallery shows every component. `bun run herdr:install` installs
  the mods, keys, settings, layout, and theme into Herdr's home as real files, and
  `bun run herdr:watch` installs on every save.

- [#72](https://github.com/sQVe/koja/pull/72)
  [`17bdc5b`](https://github.com/sQVe/koja/commit/17bdc5b03d40184a7b976e207592544e9debb6d7) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the spaces sidebar as projects: a name header per
  project, with its machine for a remote project, and one line per space with its mark and title. A
  click on a project name folds it to its active spaces and the spaces that need you, and shows how
  many it hides. A failed PR read shows `Could not read PRs` with Retry under its project. The
  sidebar no longer shows machine headers, the `+` button, `New space there`, the machine error
  line, PR numbers, or branches. `}` and `{` now step to the first space of the next and previous
  project.

- [#5](https://github.com/sQVe/koja/pull/5)
  [`f51a400`](https://github.com/sQVe/koja/commit/f51a4003aad8c92661e2987d557710feab2035ae) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw tabs and the panel switcher as rounded pills inside the
  tab bar. The bar no longer draws a line under the tabs or between them, and its buttons are
  rounded too. Active and hovered tabs, spaces, and rows use a lighter gray, and the pane header is
  slimmer, with a faint divider.

- [#17](https://github.com/sQVe/koja/pull/17)
  [`cecca4f`](https://github.com/sQVe/koja/commit/cecca4fba92b5372a197f2d4a00528b8d12e7d10) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the repository name that heads each group in the spaces
  sidebar in bold. Koja now installs Geist SemiBold and Bold, because Herdr bundles only Geist
  Regular, so semibold and bold text draws in its real weight.

- [#31](https://github.com/sQVe/koja/pull/31)
  [`8d29417`](https://github.com/sQVe/koja/commit/8d294177c2691ef700f80b7c2dfdd051d7835319) Thanks
  [@sQVe](https://github.com/sQVe)! - Show Koja's normal-mode keys as plain key hints in the
  palette, `koja-menu`, and `koja-new-menu`, such as `Ctrl+W V` for splitting a pane right. A
  `global` binding for the same action still wins.

- [#43](https://github.com/sQVe/koja/pull/43)
  [`0bb0481`](https://github.com/sQVe/koja/commit/0bb04817204896675a65400bfed36b9021729d4b) Thanks
  [@sQVe](https://github.com/sQVe)! - In normal mode, `s f` and `ä` open the picker, and
  `space space` no longer does. The palette hint for the picker reads `s f`. Normal mode also tints
  the focused pane's header and draws its title and icon in the accent color, because Herdr draws no
  focus border while normal mode holds the keyboard.

- [#65](https://github.com/sQVe/koja/pull/65)
  [`39fa238`](https://github.com/sQVe/koja/commit/39fa238e2f0460db275ab4fd7d09b7ea6027a308) Thanks
  [@sQVe](https://github.com/sQVe)! - Jump to the next pane that needs you with `g a` or `Space` in
  normal mode, and to the previous one with `g A`. A pane needs you when its agent is blocked or
  done. The jump follows the sidebar order, crosses spaces and tabs, wraps, and skips spaces the
  sidebar folds away.

- [#76](https://github.com/sQVe/koja/pull/76)
  [`fdc1745`](https://github.com/sQVe/koja/commit/fdc174577ed59b86f6534edbe96d4fa336842b97) Thanks
  [@sQVe](https://github.com/sQVe)! - Run Grove for the space menu's New worktree and Remove
  worktree, so new worktrees land in the space's Grove workspace instead of `~/.herdr/worktrees`.
  Remove asks first only when the worktree has uncommitted changes or an agent runs in its space,
  and passes `--force` to Grove only after you confirm. A clean worktree without an agent is removed
  at once. Grove's error text shows in the dialog. Open worktree still opens Herdr's dialog.

- [#6](https://github.com/sQVe/koja/pull/6)
  [`189acd7`](https://github.com/sQVe/koja/commit/189acd7d8d86c46c508791ee2bca0bec2cc8736f) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Koja's own normal mode. `ctrl-b` opens an invisible
  `koja-modal` overlay that holds the keyboard, and the Neovim key table drives panes, tabs, spaces,
  agents, the palette, and the picker. Normal mode stays open after a command, `i`, `a`, and `Enter`
  return to the pane, and the `koja-tabs` mode dot shows while it is open. It replaces the personal
  `modal` and `modal-pill` mods.

- [#24](https://github.com/sQVe/koja/pull/24)
  [`2796f18`](https://github.com/sQVe/koja/commit/2796f1887b297ef73bd6074bc509f52fd086023c) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the Mock scenes mod. Open it, type a scene name, and press
  Enter to show that scene in a fixed window built from fake data. An unknown name shows an error
  that lists the known scenes.

- [#37](https://github.com/sQVe/koja/pull/37)
  [`d3efba7`](https://github.com/sQVe/koja/commit/d3efba7ed44dc792207a2212d1ac8d020c864d44) Thanks
  [@sQVe](https://github.com/sQVe)! - Show a failed PR-list or machine-list read as an error line in
  the sidebar, with a Retry button and the age of the last good read. Retry reads the failed
  resource at once, and the line stays until that resource reads again.

- [#3](https://github.com/sQVe/koja/pull/3)
  [`06e57fe`](https://github.com/sQVe/koja/commit/06e57fe50cbf8e850b7711b4c90dc9f186413134) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw each pane as a rounded card with a 6 px gap and a faint
  outline that turns blue on the focused pane. A new `koja-pane` header replaces Herdr's: it paints
  no background, so the card's rounded corners stay clean, and it shows the focused pane's title in
  full color and the others dimmer. The tab bar no longer draws minimize, maximize, and close
  buttons.

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

- [#8](https://github.com/sQVe/koja/pull/8)
  [`4599012`](https://github.com/sQVe/koja/commit/4599012378a0b858c11ab2a335869849afdd4ebe) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw Koja's panels, tabs, menus, and dialogs in Geist, one
  size step smaller than before. Terminals keep their own font.

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
  [@sQVe](https://github.com/sQVe)! - Use a new gray light theme, `catppuccin-latte-muted`, for
  every layout. Terminals have 4 px of vertical and 10 px of horizontal padding, and the first tab
  starts at the sidebar's edge unless the macOS window buttons need the room.

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

### Patch Changes

- [#77](https://github.com/sQVe/koja/pull/77)
  [`364f1cf`](https://github.com/sQVe/koja/commit/364f1cf93c194859264fe4d22380db7e5c34e878) Thanks
  [@sQVe](https://github.com/sQVe)! - Fix Tab and Shift-Tab status filtering in the picker after
  startup, so Tab no longer moves focus away from search and prevents Escape from closing the
  picker.

- [#59](https://github.com/sQVe/koja/pull/59)
  [`0d376d0`](https://github.com/sQVe/koja/commit/0d376d05608e93261d278b7800c2665e377734f6) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the PR view design as mock scenes: a blocked PR with its
  failing checks and review threads, a prompt tray that sends them to the agent, ready and failed
  merges, and the view in the shell window.

- [#50](https://github.com/sQVe/koja/pull/50)
  [`4b9250c`](https://github.com/sQVe/koja/commit/4b9250ce9661bbb92ee428afa2d4d026ff024253) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Rail content-pane mock scenes for draft reviews, pull
  requests, and tickets. Show failed saves, sent reviews, narrow reviews, stale checks, read errors,
  loading, long content, and normal mode. Keep each outside target linked once. The `shell-content`
  scene shows the pull request pane beside the agent in the shell window.

- [#16](https://github.com/sQVe/koja/pull/16)
  [`31ae3fd`](https://github.com/sQVe/koja/commit/31ae3fd07c528deaf7749aea94a59406e925d25f) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The tests now share one fake for each
  Herdr module and run in parallel without isolation, so they pass in any file order and in mutation
  runs.

- [#11](https://github.com/sQVe/koja/pull/11)
  [`985fd29`](https://github.com/sQVe/koja/commit/985fd290bf97fd97ee371543c008886d56841932) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode moves between panes with the arrow keys, alone or
  after `ctrl-w`, the same as `ctrl-h/j/k/l` and `ctrl-w h/j/k/l`.

- [#72](https://github.com/sQVe/koja/pull/72)
  [`17bdc5b`](https://github.com/sQVe/koja/commit/17bdc5b03d40184a7b976e207592544e9debb6d7) Thanks
  [@sQVe](https://github.com/sQVe)! - Add a shared sidebar project header with remote machine labels
  and folded-space counts. Show blocked sidebar spaces with a red question bubble while tabs and
  picker rows keep their dot.

- [#63](https://github.com/sQVe/koja/pull/63)
  [`8179bb2`](https://github.com/sQVe/koja/commit/8179bb26b7d9ea5bbe6f94e81ef496e1753342e5) Thanks
  [@sQVe](https://github.com/sQVe)! - Make Tab and Shift-Tab in normal mode mark the next and
  previous shown section instead of stepping spaces. `s j` and `s k` still step spaces. While the
  sidebar is marked, `j`, `k`, `g g`, `G`, `ctrl-d`, `ctrl-u`, and `enter` go to the sidebar as list
  commands, and Escape moves the mark back to the panes. A hidden sidebar is skipped and loses its
  mark.

  The list keys move a cursor over the shown rows of the marked sidebar, drawn as an accent outline
  that starts on the active space. `enter` selects the space under the cursor.

  When the sidebar becomes marked, or a list key moves the cursor, and the cursor row is outside the
  view, the sidebar scrolls to show it. The sidebar now needs Herdr 0.1.15 or later.

- [#73](https://github.com/sQVe/koja/pull/73)
  [`7bf875a`](https://github.com/sQVe/koja/commit/7bf875a166ac012efea3503aa6bb9ed20858affa) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw a project's main checkout as its header in the spaces
  sidebar instead of as a second row with the same name. The header shows that space's agent mark,
  and a click on it selects the space. A chevron on hover folds the project. A project without a
  main checkout keeps folding on a click on its name. `}` and `{` and the list cursor stop on the
  header.

- [#61](https://github.com/sQVe/koja/pull/61)
  [`3c5e260`](https://github.com/sQVe/koja/commit/3c5e2605e17eb3cec2761ed2db3939cdd650ced1) Thanks
  [@sQVe](https://github.com/sQVe)! - Refine ticket mock state words, plan alignment, progress
  counts, and failure guidance. Bring single-ticket acceptance into view and keep wide-view titles
  readable in the rail. Show the container ticket view beside its agent in the shared `shell-ticket`
  scene.

- [#7](https://github.com/sQVe/koja/pull/7)
  [`675f1a2`](https://github.com/sQVe/koja/commit/675f1a27cca46b4ae5b558f1362165ca51bed72c) Thanks
  [@sQVe](https://github.com/sQVe)! - Koja now computes space and tab status for the sidebar, tab
  bar, and picker with one shared rollup. It counts working and blocked sub-agents that have no
  pane, at any depth.

- [#78](https://github.com/sQVe/koja/pull/78)
  [`cee7ecc`](https://github.com/sQVe/koja/commit/cee7eccd0561fc6ca9734f5033cf133336d8f9b4) Thanks
  [@sQVe](https://github.com/sQVe)! - Dragging a space in the spaces sidebar now moves it within its
  own project and keeps the project order, even when Herdr lists spaces of other projects between
  its spaces. A row in another project and the main space header refuse the drop: they show no drop
  line and a not-allowed cursor, and a drop there moves nothing. The header itself stays first in
  its project.

- [#17](https://github.com/sQVe/koja/pull/17)
  [`cecca4f`](https://github.com/sQVe/koja/commit/cecca4fba92b5372a197f2d4a00528b8d12e7d10) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep letter spacing even in search results. Highlighted
  matches in the palette and picker no longer open small gaps inside words.

- [#55](https://github.com/sQVe/koja/pull/55)
  [`6ce3727`](https://github.com/sQVe/koja/commit/6ce3727e8dd96fe45c11c4f32c02a24df1a473fd) Thanks
  [@sQVe](https://github.com/sQVe)! - Ask before closing a pane also ends other panes through
  terminal parent relationships, including worker tabs and descendants reached through hidden
  terminals. The dialog says "Close space?" when no pane would remain, or counts the other panes
  that will close. Escape keeps the panes running.

- [#51](https://github.com/sQVe/koja/pull/51)
  [`ea49267`](https://github.com/sQVe/koja/commit/ea4926773eca1d05c040bbbf6e690eb6b0d353bb) Thanks
  [@sQVe](https://github.com/sQVe)! - Add attention mock scenes for agent asks: a card in the
  focused pane that shows the whole question and any command, a list of other asks, and the
  normal-mode `g n` hint. Show the card and the list inside the shell mock's focused pane.

- [#4](https://github.com/sQVe/koja/pull/4)
  [`2b1aace`](https://github.com/sQVe/koja/commit/2b1aaceeab2462f12bf02e571d8e599279ff7ad1) Thanks
  [@sQVe](https://github.com/sQVe)! - Round the backgrounds of the command palette, the terminal
  menu, and the new tab menu to Herdr's popup frame, so their corners no longer show a square dot.

- [#10](https://github.com/sQVe/koja/pull/10)
  [`6b5ce04`](https://github.com/sQVe/koja/commit/6b5ce047b109711ea073ba684ab8d6f3a0c92580) Thanks
  [@sQVe](https://github.com/sQVe)! - Fix normal mode losing the keyboard after it moves focus. A
  pane, tab, or space action now takes the keyboard back as soon as Herdr applies the move, so the
  next key reaches normal mode instead of the terminal. A loss normal mode did not cause keeps the
  status check, but a `toast` no longer blocks it, lookups back off while another overlay stays
  open, stale replies are dropped, and a reply without an overlay list keeps the current keyboard
  owner. When a palette or picker closes, normal mode checks the keyboard owner at once instead of
  waiting out the backoff.

- [#48](https://github.com/sQVe/koja/pull/48)
  [`d0cf6fe`](https://github.com/sQVe/koja/commit/d0cf6febd9eb156cb123f274b8b4bd29bb8e2dc0) Thanks
  [@sQVe](https://github.com/sQVe)! - Add mock scenes for four structures of the right side panel
  with Files, Changes, Stack, and Workers: tabs (`panels-tabs-*`), collapsible sections
  (`panels-sections`), the stack as a spine (`panels-spine`, `panels-spine-files`), and two docks
  (`panels-docks`). Add three takes on the stack as a spine (`spine-inline`, `spine-rail`,
  `spine-pinned`), and `rail-*` scenes that show the graph rail without a commit bar when the work
  is large, clean, a single PR, a branch with no PR, on `main`, after a failed read, and in normal
  mode. Add `split-two-*` and `split-three-*` scenes that split the panel into a Stack and a Workers
  section, or into Stack, Changes, and Workers. Add `space-*` scenes of the chosen panel, named
  Space, with Stack and Workers sections in every state. The `shell` scene shows the Space panel in
  place of Changes, with one Space toggle in the tab bar.

- [#64](https://github.com/sQVe/koja/pull/64)
  [`58eecbf`](https://github.com/sQVe/koja/commit/58eecbf13bcebec88ad2d224bfea81e6d958e1a3) Thanks
  [@sQVe](https://github.com/sQVe)! - Step with the bracket keys in normal mode: `]` and `[` for
  spaces, `)` and `(` for tabs, and `}` and `{` for the main space of the next and previous
  repository in the sidebar. The palette and the menus now show the one-key alias of an action that
  has one.

- [#61](https://github.com/sQVe/koja/pull/61)
  [`3c5e260`](https://github.com/sQVe/koja/commit/3c5e2605e17eb3cec2761ed2db3939cdd650ced1) Thanks
  [@sQVe](https://github.com/sQVe)! - Add twelve ticket view mock scenes for the selected plan
  layout, including loading, read failures, blocked and completed plans, tikk, long plans, and wide
  and normal-mode views. Keep source status separate from readiness, show the completed state with a
  check, and put wide-view guidance in the rail.

- [#4](https://github.com/sQVe/koja/pull/4)
  [`2b1aace`](https://github.com/sQVe/koja/commit/2b1aaceeab2462f12bf02e571d8e599279ff7ad1) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the selected row in the terminal menu when Git actions
  load, instead of moving the highlight to a different entry.

- [#21](https://github.com/sQVe/koja/pull/21)
  [`b7f3f34`](https://github.com/sQVe/koja/commit/b7f3f34674ee6043683dab13b628f94bb8144bef) Thanks
  [@sQVe](https://github.com/sQVe)! - Name an unnamed tab whose terminals all carry a Tau task by
  that task. A tab with one worker shows its task, and a tab with several shows the first task and a
  count of the others, such as "Fix status counts +2". The tab bar and the picker both use the new
  name, and the picker search matches it.

- [#37](https://github.com/sQVe/koja/pull/37)
  [`d3efba7`](https://github.com/sQVe/koja/commit/d3efba7ed44dc792207a2212d1ac8d020c864d44) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the tab bar, pane headers, and sidebar rows through the
  kit's text roles, 24 px rows, and hover rule. Tab icons take the tab's text color, and repository
  branch names cut in the middle so the branch and age stay readable.

- [#9](https://github.com/sQVe/koja/pull/9)
  [`c48dd81`](https://github.com/sQVe/koja/commit/c48dd810f5044c8084bc65b300f95a5aa2072cb8) Thanks
  [@sQVe](https://github.com/sQVe)! - Name tabs in the Go to panel the same way as the tab bar. An
  unnamed tab shows the program it runs, such as `tuicr`, instead of `Tab 1 · <pane title>`, and its
  icon comes from that program too.

- [#50](https://github.com/sQVe/koja/pull/50)
  [`4b9250c`](https://github.com/sQVe/koja/commit/4b9250ce9661bbb92ee428afa2d4d026ff024253) Thanks
  [@sQVe](https://github.com/sQVe)! - Clarify content-pane sources, agent references, check
  freshness, and review send states. Align review gutters and file controls, and add comment counts
  and thread context. Show unsaved comments and the review folder recovery path. Make Retry save the
  main action after a failed save and keep stale check ages visible. Distinguish edited lines from
  commented lines and restore draft review comment totals. Align section body text and keep ticket
  states beside their items. Put PR checks and threads before description and files.

- [#25](https://github.com/sQVe/koja/pull/25)
  [`2c62b7a`](https://github.com/sQVe/koja/commit/2c62b7a4a54389953dcd525de154440221a8a4cc) Thanks
  [@sQVe](https://github.com/sQVe)! - Add four palette smoke scenes to the Mock scenes mod, used to
  check the judge-mock skill.

- [#15](https://github.com/sQVe/koja/pull/15)
  [`1f7d2bf`](https://github.com/sQVe/koja/commit/1f7d2bfa9f36b7cfbb38ac2ae6ec1ee7b61df8a2) Thanks
  [@sQVe](https://github.com/sQVe)! - Mark sidebar spaces with no agent with a hollow ring in their
  status slot, in full rows and in the narrow rail.

- [#71](https://github.com/sQVe/koja/pull/71)
  [`6d89480`](https://github.com/sQVe/koja/commit/6d894806b75d601ab312bf9988879735f2b9fa36) Thanks
  [@sQVe](https://github.com/sQVe)! - Pick a key in the key help to run it. `Down` and `Up` move the
  selected row, and `Enter` closes the help and runs the row in normal mode, as if you typed its
  keys.

- [#22](https://github.com/sQVe/koja/pull/22)
  [`3a87eaa`](https://github.com/sQVe/koja/commit/3a87eaa8e123132ecfae290b7b2f7c6e573d6d2c) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode moves between panes with Ctrl and an arrow key,
  the same as `ctrl-h/j/k/l`.

- [#32](https://github.com/sQVe/koja/pull/32)
  [`551acee`](https://github.com/sQVe/koja/commit/551acee8a447839ddb66530e2e49551bf95f1256) Thanks
  [@sQVe](https://github.com/sQVe)! - The `catppuccin-latte-muted` theme's text and status marks now
  meet WCAG 2.2 AA contrast. The "Needs you" badge label draws in the dark foreground color. The
  diff hunk header, the diff line numbers, and the disabled action button label use the darker muted
  color. A hovered solid or danger button draws a ring instead of fading its fill and label.

- [#67](https://github.com/sQVe/koja/pull/67)
  [`136a83f`](https://github.com/sQVe/koja/commit/136a83f12b873105dbb5247934d687c1c6b6c8c1) Thanks
  [@sQVe](https://github.com/sQVe)! - Press `?` in normal mode to see every normal-mode key in a
  searchable help. Press `Escape` to close the help and keep using normal-mode keys.

- [#18](https://github.com/sQVe/koja/pull/18)
  [`f1a60fe`](https://github.com/sQVe/koja/commit/f1a60fe8cdaf4b50bcb4c2a0bbdde5bed1ffc312) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. Tests now cover the menu, modal,
  palette, palette color, and picker (rows, matching, and preview) paths that mutation testing found
  uncovered.

- [#56](https://github.com/sQVe/koja/pull/56)
  [`c0651df`](https://github.com/sQVe/koja/commit/c0651df4869dfd006566925e13ff675d1b1ba37f) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. `bun run sandbox identity` tells
  whether a running sandbox serves the checkout's current mods and config, and the installer records
  the checkout it installed from and whether every mod check passed. The repository has a QA guide,
  `.pi/qa.md`, and the command palette's QA recipe moved next to it, so the build no longer filters
  QA recipes.

- [#70](https://github.com/sQVe/koja/pull/70)
  [`5a1495f`](https://github.com/sQVe/koja/commit/5a1495f86efe0088b91ff692d77580fe62b1c440) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the sidebar parts to the kit: the work icon, stack
  progress, view switch, link text, selected-space footer, and hover card with its arrow. The kit
  gallery shows each one under "Sidebar parts", and the Mock scenes mod draws them as one sidebar in
  the `sidebar-parts` scene.

- [#53](https://github.com/sQVe/koja/pull/53)
  [`c464ed6`](https://github.com/sQVe/koja/commit/c464ed6a48d4fb7fafa53bfbe636c93b31694137) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The command palette has a QA recipe for
  agents that test it in the sandbox.

- [#57](https://github.com/sQVe/koja/pull/57)
  [`497ec60`](https://github.com/sQVe/koja/commit/497ec604273de220b301dbb6f72b180cebf9c36b) Thanks
  [@sQVe](https://github.com/sQVe)! - Fix the Changes panel staying on "Loading changes" after a
  switch to another space or folder. The panel now reads the new location and shows its files or its
  state line.

- [#26](https://github.com/sQVe/koja/pull/26)
  [`1af6af4`](https://github.com/sQVe/koja/commit/1af6af444896698747f3ccf2da112d2297769cfd) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode scrolls the focused pane's history with Neovim's
  keys: `ctrl-u` and `ctrl-d` for half a page, `ctrl-b` and `ctrl-f` for a page, `ctrl-y` and
  `ctrl-e` for a line, and `gg` and `G` for the top and bottom.

- [#43](https://github.com/sQVe/koja/pull/43)
  [`0bb0481`](https://github.com/sQVe/koja/commit/0bb04817204896675a65400bfed36b9021729d4b) Thanks
  [@sQVe](https://github.com/sQVe)! - The pane header's split, zoom, and close buttons now show a
  tooltip and carry an accessible name.

- [#62](https://github.com/sQVe/koja/pull/62)
  [`0e3c6bd`](https://github.com/sQVe/koja/commit/0e3c6bd588c8a60239318a05911c43ebebc7eb17) Thanks
  [@sQVe](https://github.com/sQVe)! - Add six mock scenes of a pane header that shows the keyboard
  mode: `header-mode-insert`, `header-mode-normal`, `header-mode-pending`, `header-mode-split`,
  `header-mode-split-normal`, and `header-mode-lone`. The focused pane's header shows the mode as a
  flat tag and each pending key as a keycap, and the tab bar draws no mode pill. In normal mode only
  the focused pane draws the accent border. A shell pane with no agent shows the idle dot. A narrow
  header cuts and then drops the task, shortens the folder to its last segment, cuts the branch in
  its middle, and last drops the folder. The mods stay as they are.

- [#11](https://github.com/sQVe/koja/pull/11)
  [`985fd29`](https://github.com/sQVe/koja/commit/985fd290bf97fd97ee371543c008886d56841932) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode accepts Neovim's ctrl versions of the `ctrl-w`
  keys, such as `ctrl-w ctrl-v` to split right and `ctrl-w ctrl-w` to move to the next pane.
  `ctrl-w ctrl-c` cancels, as in Neovim.

- [#13](https://github.com/sQVe/koja/pull/13)
  [`8d7f4b8`](https://github.com/sQVe/koja/commit/8d7f4b8e080f17db5a2252d9a2a89520e92538e3) Thanks
  [@sQVe](https://github.com/sQVe)! - Make Tab and Shift-Tab in normal mode step through the spaces
  in the order the sidebar shows, wrapping at both ends. Spaces hidden in a folded repository or a
  folded machine are skipped. When the sidebar order is not known, Tab and Shift-Tab still run
  Herdr's next and previous space.

- [#74](https://github.com/sQVe/koja/pull/74)
  [`a69d7e4`](https://github.com/sQVe/koja/commit/a69d7e4fba68b5564ca9ac585590dcdbaef7d71d) Thanks
  [@sQVe](https://github.com/sQVe)! - Show a space or tab as working while any pane or sub-agent in
  it still runs. It shows done only after all work in it stops. Blocked work still takes priority
  over both.

- [#69](https://github.com/sQVe/koja/pull/69)
  [`d7bae70`](https://github.com/sQVe/koja/commit/d7bae701bcf236d524339f7101038e9f0b08159f) Thanks
  [@sQVe](https://github.com/sQVe)! - Remove the sidebar's narrow rail. The sidebar keeps full rows
  and stops shrinking at 200 px.

- [#44](https://github.com/sQVe/koja/pull/44)
  [`365369b`](https://github.com/sQVe/koja/commit/365369b3c371fad74ad1bfb1cb83ce65d0819485) Thanks
  [@sQVe](https://github.com/sQVe)! - Stop showing "Could not read PRs." in the spaces sidebar for a
  repository without a git remote. Such a repository has no PRs, so its group shows no PR facts and
  no error line. A real failed read still shows the error line with Retry. Sidebar error lines no
  longer show a tooltip that repeats their text.

- [#40](https://github.com/sQVe/koja/pull/40)
  [`a4d2791`](https://github.com/sQVe/koja/commit/a4d27912ab804f2fad647a836040d355cb731f57) Thanks
  [@sQVe](https://github.com/sQVe)! - Add two mock scenes of Koja's chosen visual direction,
  `direction-koja` for insert mode and `direction-koja-normal` for normal mode. They draw the whole
  window from their own set of colors and sizes. Pane headers in the shell scene now show the branch
  and the folder together.

- [#45](https://github.com/sQVe/koja/pull/45)
  [`9be948c`](https://github.com/sQVe/koja/commit/9be948c56cff40a651a442d726a47a94dce9ea75) Thanks
  [@sQVe](https://github.com/sQVe)! - Ask with Koja's own dialog before `pane.close` closes the last
  pane of a space's last tab. Normal mode `w q` on a lone pane now opens a "Close space?" dialog
  that takes Enter and Escape, and the pane header's close button opens the same dialog.

- [#46](https://github.com/sQVe/koja/pull/46)
  [`1bd4916`](https://github.com/sQVe/koja/commit/1bd491612f248d4cdadff5442c90cb7911a6e577) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the sidebar design as mock scenes: `direction-koja` now
  shows the Projects view, and `sidebar-inbox`, `sidebar-hover`, `sidebar-find`, and
  `sidebar-states` show the Inbox, the stack hover card, the picker search for a PR, and the
  machine, folded, and failed-read states. The shell scene draws the new sidebar. The kit gains six
  icons for what a space's agent or pull requests need.

- [#28](https://github.com/sQVe/koja/pull/28)
  [`feec883`](https://github.com/sQVe/koja/commit/feec883c396a4a1d8384335dbd5819e6592057e8) Thanks
  [@sQVe](https://github.com/sQVe)! - Split the kit gallery code by section. The mods do not change;
  only the gallery's own source moves into one module per section.

- [#29](https://github.com/sQVe/koja/pull/29)
  [`23a4751`](https://github.com/sQVe/koja/commit/23a47518bb6b9c3f45a1f81ad9dc97a3fcf306ed) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The sidebar, Changes, and picker mods
  now keep their drawing, data reads, and preview loading in modules beside `main.ts`.

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

- [#47](https://github.com/sQVe/koja/pull/47)
  [`1dc22e2`](https://github.com/sQVe/koja/commit/1dc22e2d2cb288da28d1113df3a8c8af15fc8826) Thanks
  [@sQVe](https://github.com/sQVe)! - Add mock scenes of Koja's overlays in the chosen visual
  direction: `overlay-palette`, `overlay-goto`, `overlay-keys`, `overlay-menu`, `overlay-new`,
  `overlay-menu-normal`, and `overlay-new-normal`. The `shell` scene shows the command palette.

- [#79](https://github.com/sQVe/koja/pull/79)
  [`1a19cfd`](https://github.com/sQVe/koja/commit/1a19cfd33c3e8cbd37b77aa8b32242b9a4aa2857) Thanks
  [@sQVe](https://github.com/sQVe)! - Read a folder's git identity through one rule for every
  surface. A checkout is the main one when its git folder is the repository's common folder, which
  also covers checkouts made with `git clone --separate-git-dir`. A failed git command is a failed
  read, never an empty repository. The Changes view and the worktree dialog show git's error when
  git cannot read the folder.

- [#52](https://github.com/sQVe/koja/pull/52)
  [`b4ecace`](https://github.com/sQVe/koja/commit/b4ecacefb1d5e5c7492f9a53ae9b15a9b9462b05) Thanks
  [@sQVe](https://github.com/sQVe)! - Add draft review mock scenes for inline comments, range and
  file comments, editing, save recovery, changed files, submitted reviews, unreadable requests, long
  plans, and normal mode. Show line actions, range-selection hints, kept edits, readable editor
  comments, conflict word changes, and the complete file order. Keep file actions local, distinguish
  comment brackets from edit bars, and end the mock viewports on complete rows. Keep comment
  guidance visible and explain how sending adds open work. Use consistent filled file actions,
  separate comment and edit gutter slots, and a single-field draft composer. Align editor comment
  anchors and conflict labels. Mark the cursor line by its number, label kept edits, and name ranges
  in the comment hint. Show the same draft review pane in a shared-shell scene with its own active
  tab and the space panel closed.

- [#75](https://github.com/sQVe/koja/pull/75)
  [`e51a19e`](https://github.com/sQVe/koja/commit/e51a19ef63ac1956623e454c5573369b08740357) Thanks
  [@sQVe](https://github.com/sQVe)! - Show wait ages on non-working, non-selected rows in the
  sidebar reference scenes.

- [#33](https://github.com/sQVe/koja/pull/33)
  [`c684535`](https://github.com/sQVe/koja/commit/c684535af84a59e6402cd0ef8632de0b64a82005) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the previous Changes list when a refresh fails, show a
  stale line with its age and a Retry, and disable Commit until the same repository reads again. A
  failed first read and a failed folder watch now show their own error lines. A file change during a
  read now starts another read before Commit turns on, so Commit never stages files the list does
  not show. The Changes list draws its text and rows through the kit.

- [#49](https://github.com/sQVe/koja/pull/49)
  [`63d9c2d`](https://github.com/sQVe/koja/commit/63d9c2df8cfff8efedf1f2eaec5fc3699ce85cf0) Thanks
  [@sQVe](https://github.com/sQVe)! - Add mock scenes of Koja's dialogs in the chosen visual
  direction: `dialog-close`, `dialog-close-normal`, `dialog-rename`, `dialog-rename-normal`,
  `dialog-wt-new`, `dialog-wt-open`, and `dialog-wt-remove`. The `shell-dialog` scene shows the
  close dialog over the shell window.
