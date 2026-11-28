# koja

## 0.8.0

### Minor Changes

- [#149](https://github.com/sQVe/koja/pull/149)
  [`25d35cb`](https://github.com/sQVe/koja/commit/25d35cbbf2a3242a9a5097911fc19df11d41c87c) Thanks
  [@sQVe](https://github.com/sQVe)! - Stack rows show how far they have merged, and the selected
  space's footer links to its ticket and PR.

## 0.7.0

### Minor Changes

- [#146](https://github.com/sQVe/koja/pull/146)
  [`428a5ca`](https://github.com/sQVe/koja/commit/428a5cae2255dbf0f43ecafc06d4c6c3020ef42b) Thanks
  [@sQVe](https://github.com/sQVe)! - Hovering a space with a stack shows its pull requests in a
  card.

## 0.6.0

### Minor Changes

- [#142](https://github.com/sQVe/koja/pull/142)
  [`8ad146e`](https://github.com/sQVe/koja/commit/8ad146ef198b029afd7f1e45e15b939b3203b446) Thanks
  [@sQVe](https://github.com/sQVe)! - The sidebar can switch to an Inbox that groups spaces by what
  needs you.

## 0.5.0

### Minor Changes

- [#140](https://github.com/sQVe/koja/pull/140)
  [`b0beb74`](https://github.com/sQVe/koja/commit/b0beb74d18f8d223665af6eaa91193ff99c896f7) Thanks
  [@sQVe](https://github.com/sQVe)! - Sidebar rows show what each space's pull requests need from
  you.

### Patch Changes

- [#140](https://github.com/sQVe/koja/pull/140)
  [`b0beb74`](https://github.com/sQVe/koja/commit/b0beb74d18f8d223665af6eaa91193ff99c896f7) Thanks
  [@sQVe](https://github.com/sQVe)! - The picker's work icon covers every open PR in a space's
  stack.

## 0.4.0

### Minor Changes

- [#137](https://github.com/sQVe/koja/pull/137)
  [`78a1123`](https://github.com/sQVe/koja/commit/78a11233481bd58de53b9290f38b2cc4eeb764a0) Thanks
  [@sQVe](https://github.com/sQVe)! - Record all nine ported mods at Herdr 0.1.18. They take these
  Herdr changes:

  - The pane menu inside a tab offers Rename first. A terminal outside a tab, such as a layout
    terminal block or a window, has no pane, so its menu offers no Split right, Split down, Zoom, or
    Close pane.
  - A name given with `pane.rename` wins over the program name and the terminal title in the pane
    header.
  - The new-tab menu opens with the agent list each machine reported last, and keeps listing the
    installed agents it remembers when a check fails, under "Could not check installed agents".
  - A tab switches by wheel: one tab per notch, line deltas at once, and pixel deltas in steps of 20
    px then 60 px, at most one step per 100 ms. The active tab stays in view. An unnamed tab shows
    the agent's live title when that title tells its work.
  - The palette lists the commands a mod declares in its `palette` list, in a Mod group, and runs
    one with the arguments the mod gave. A shortcut whose action names a command and arguments draws
    on its row, and the palette offers only themes the window can show now.
  - The Changes panel reads `git status` once for every panel copy of a folder. Timed scans run only
    while the window is visible, and a slower scan is repeated less often. Its diff draws at the
    terminal's font size, tabs pad to four-column stops, and a wide glyph takes two columns.
  - The spaces sidebar keeps the active space in view when a header above it appears or folds.

## 0.3.0

### Minor Changes

- [#135](https://github.com/sQVe/koja/pull/135)
  [`b7e5784`](https://github.com/sQVe/koja/commit/b7e57845e2eee9eb7d142eab3b48f99b2ca9da1c) Thanks
  [@sQVe](https://github.com/sQVe)! - Find a space in the picker by any pull request number, ticket,
  or branch in its stack, merged ones included. A space found that way draws why it matched at the
  end of its row, such as `[#504](https://github.com/sqve/koja/issues/504) · PR 2 of 8 · merged`.

### Patch Changes

- [#135](https://github.com/sQVe/koja/pull/135)
  [`b7e5784`](https://github.com/sQVe/koja/commit/b7e57845e2eee9eb7d142eab3b48f99b2ca9da1c) Thanks
  [@sQVe](https://github.com/sQVe)! - Pull request reads that run on a timer or on a branch change
  pause while the window is hidden, not while it is unfocused, so a sidebar on a second display
  stays fresh.

## 0.2.0

### Minor Changes

- [#134](https://github.com/sQVe/koja/pull/134)
  [`cba4dd8`](https://github.com/sQVe/koja/commit/cba4dd859c0d8370ec711fa70835bcdcc27cfafa) Thanks
  [@sQVe](https://github.com/sQVe)! - Read each space's stack from the repository's gh-stack record.
  A space on a stack branch now reads every PR and ticket in its stack, and a stack whose tickets
  share a parent takes the parent's title unless the user named the space.

- [#111](https://github.com/sQVe/koja/pull/111)
  [`acab648`](https://github.com/sQVe/koja/commit/acab648dea6ca719804754a00ceb878c9e2252e8) Thanks
  [@sQVe](https://github.com/sQVe)! - Round every corner Koja draws with one 6 px radius: pane and
  side panel frames, tabs, inset row pills, buttons, icon toggles, and the mode pill. Badges keep 4
  px, and a card's inner corner follows its frame. The kit's pane header, which the mock scenes
  draw, no longer paints a focus fill: in insert mode the pane border and the brighter title mark
  focus, and normal mode keeps its tint.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Play the blocked sound once for each agent ask the user cannot
  see. A redraw of the same ask, an ask in sight, and a finished turn play nothing.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the new menu as the kit's overlay card, 296 px wide under
  the tab bar's `+`, which shows pressed while it is open. `New tab` holds Terminal and the
  installed agents, and `New space` holds Empty space and the two worktree rows, named after the
  repository they work from. With no agent installed the menu says so, and a failed agent lookup
  shows an error line with Retry.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Show an agent ask the user cannot see in one card at the
  bottom of the main column. The card names the space and the agent, shows the question and, for a
  permission ask, the command, and closes when the ask is answered, gone to, or dismissed. A click
  on the card goes to the asking pane.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the command palette as one frameless overlay card: a 560
  px card centered in the main column, grouped headings with part-letter keycaps, 26 px rows with an
  icon and the mode's key hint, a scroll thumb, and a footer that counts every command or only the
  matches. The kit gains the overlay row, the overlay heading, the search input line, the scroll
  thumb, and the main-column insets.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the pane, tab, space, and theme menus as the kit's
  overlay card, 248 px wide. A pane menu starts with the pane's mark and name, rows are 24 px, the
  right-click row shows `on` or `off`, and key hints follow the mode the menu opened in. A space
  menu whose checkout read fails shows an error line with Retry in place of the worktree rows.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Show Go to as one overlay card: the search line, status chips
  with their counts, a `Spaces` heading, 28 px space rows with the agent mark, the project, and one
  work icon, a preview header naming the space, pane, branch, and pull request, and a footer with
  its keys. A preview that cannot start keeps Go to open on an error line with Retry instead of
  falling back to Herdr's picker.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Open the list of every unseen ask from the card's more line.
  The card grows upward into one row per ask, newest first, each with its space, project and age,
  the agent and question, and a permission ask's command. A row fills on hover, and a click goes to
  that ask's pane and closes the list.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Show a key hint card while normal mode waits for the key after
  a part letter. The card names the part and lists the keys that can follow, grouped by what they
  do, drawn from the kit's normal-mode key table. The next key still runs its action; a press on the
  card cancels the sequence.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the confirm dialog as the compact card: 360 px wide, the
  overlay card surface and outline, one 13 px text size, 24 px buttons, and an Enter keycap on the
  main button. A destructive ask puts a red triangle-alert before its title, and the body lines up
  with the title text. The card grows with its content, so a long space name never pushes the
  buttons out of the dialog.

  The close-space confirm now reads `Close space “<name>”?` and names the agents that stop and the
  tabs that close, then what stays. An agent still working stops mid-task; one that has finished
  stops. A mixed space warns only about the agents that are mid-task. A space with no agent running
  names only its tabs.

- [#109](https://github.com/sQVe/koja/pull/109)
  [`59a48c0`](https://github.com/sQVe/koja/commit/59a48c02dad47a2c2f06ada0a6138591b7c59889) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the overlay card, the keycap, the mode-aware hint, the
  search line, the footer line, and the segmented chip to the kit, with a gallery entry for each.
  The card and the parts draw through the theme tokens, and a hint follows the mode the overlay
  opened in.

### Patch Changes

- [#108](https://github.com/sQVe/koja/pull/108)
  [`9dc751c`](https://github.com/sQVe/koja/commit/9dc751caedbe12ec9798341fec47d61a6cff7629) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the content pane's item header, source links, and fact
  rows to the kit. The header draws the item's identifier as a link naming its source, its title, a
  state chip, and one age, and a loading item draws only the identifier and its source. Facts draw
  as rows with one label column, or as pairs that wrap under the title, and a linked value can name
  its source's state after it. The kit also gains an open pull request icon. The kit gallery's
  Content section shows each part in every state, with a long ticket title and its wrapped facts.

- [#133](https://github.com/sQVe/koja/pull/133)
  [`1cc8075`](https://github.com/sQVe/koja/commit/1cc807567a0dd14e56b92a0ff06ea0d7428154f8) Thanks
  [@sQVe](https://github.com/sQVe)! - Move the pinned Herdr declarations to Herdr 0.1.18, so mods
  typecheck against the API of the release Koja targets.

- [#131](https://github.com/sQVe/koja/pull/131)
  [`161b8a2`](https://github.com/sQVe/koja/commit/161b8a24862c732e5d064089122a2f82552c9284) Thanks
  [@sQVe](https://github.com/sQVe)! - Cut a long item state word in the header chip instead of
  letting it push past the header. The chip's marks now come from one record, so a new state needs
  its own mark, and the in-review mark reuses the shared blocked bubble. The document line and the
  action block each build their layout once.

- [#95](https://github.com/sQVe/koja/pull/95)
  [`ac78879`](https://github.com/sQVe/koja/commit/ac78879dbda7785f4390c0b230be0758e0f3fb46) Thanks
  [@sQVe](https://github.com/sQVe)! - Wait for the exact mock scene ready line before capturing, run
  each capture under its sandbox lock, and publish capture files only after all three exist. A scene
  writes its ready line only after the frame that draws it has run, so a capture no longer shoots
  the picker or an empty frame. The worktree dialog asks about closing a space only when an agent it
  has not warned about is running, and closes the space directly once that agent has stopped.

- [#108](https://github.com/sQVe/koja/pull/108)
  [`9dc751c`](https://github.com/sQVe/koja/commit/9dc751caedbe12ec9798341fec47d61a6cff7629) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the content pane's action block and document gutter to the
  kit. The action block draws one solid main button that names its effect. A failed save makes
  `Retry save` the main button, with the error, the folder on its own line, a `Copy path` recovery
  button, the unsaved count, and the dim line that says the send waits for a save. A sent review
  draws the check and the next step instead of a control. A document line draws a right-aligned line
  number, a warning bar on an edited line with `edited` once, and a neutral bar on commented lines.
  The kit gains a monospace text role, which draws in the terminal font from settings. The kit
  gallery's Content section shows each action state and a document with edited and commented lines.

- [#125](https://github.com/sQVe/koja/pull/125)
  [`33f2ac8`](https://github.com/sQVe/koja/commit/33f2ac89f25713a53ac769b31e41e9b6cdea34ca) Thanks
  [@sQVe](https://github.com/sQVe)! - Show the normal-mode jump key on the ask card: `)` with "Go to
  the next pane that needs you", under the question and any command.

- [#127](https://github.com/sQVe/koja/pull/127)
  [`7775dc8`](https://github.com/sQVe/koja/commit/7775dc8471a85000753f3364d61c79dbe65e946b) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The data layer's large test suites and
  the spaces mod's main test suite are split by behavior, and the PR Retry interleaving test drives
  the production scheduler instead of a test-only owner.

- [#95](https://github.com/sQVe/koja/pull/95)
  [`ac78879`](https://github.com/sQVe/koja/commit/ac78879dbda7785f4390c0b230be0758e0f3fb46) Thanks
  [@sQVe](https://github.com/sQVe)! - Ask for a worktree remove only once its risks are known.
  Remove names uncommitted changes and a running agent together, re-reads the risk before Grove runs
  and the live agent before it closes the space, and claims Herdr's close confirmation only for the
  set it showed. `--force` needs a confirmed change loss, so an agent-only warning leaves Grove's
  own guards on. Escape or a host close stops every command and check that would follow, including a
  space open or close. A Grove process that already started is not stopped. A branch or worktree
  name that starts with `-` is refused, and a new worktree whose folder Git does not list offers a
  lookup-only retry.

- [#114](https://github.com/sQVe/koja/pull/114)
  [`c1317c2`](https://github.com/sQVe/koja/commit/c1317c2da17719b219ab2544c062d242f862e953) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the content pane's sections, status rows, and part notes
  to the kit. A section draws a collapsible header with its name and a dim count, its header folds
  it, and every part starts at the label's edge. A status row draws a mark in a fixed slot, the
  name, a detail line under it at the same indent, and a state word; a row of a part that failed to
  refresh keeps its mark still. A part note names the part, its age, and Retry, which reads the part
  again. The kit gallery's Content section shows a pull request's checks, threads, and slices, live
  and stale, and folds each section.

- [#122](https://github.com/sQVe/koja/pull/122)
  [`69db062`](https://github.com/sQVe/koja/commit/69db0620cf74157df25fe7e7f7e060958ac23243) Thanks
  [@sQVe](https://github.com/sQVe)! - Cover the sidebar's space close watch with generated look
  orders. A close now has a test that only selects a live space and follows one close at most once.

## 0.1.0

### Minor Changes

- [#76](https://github.com/sQVe/koja/pull/76)
  [`fdc1745`](https://github.com/sQVe/koja/commit/fdc174577ed59b86f6534edbe96d4fa336842b97) Thanks
  [@sQVe](https://github.com/sQVe)! - Run Grove for the space menu's New worktree and Remove
  worktree, so new worktrees land in the space's Grove workspace instead of `~/.herdr/worktrees`.
  Remove asks first only when the worktree has uncommitted changes or an agent runs in its space,
  and passes `--force` to Grove only after you confirm. A clean worktree without an agent is removed
  at once. Grove's error text shows in the dialog. Open worktree still opens Herdr's dialog.

- [#65](https://github.com/sQVe/koja/pull/65)
  [`39fa238`](https://github.com/sQVe/koja/commit/39fa238e2f0460db275ab4fd7d09b7ea6027a308) Thanks
  [@sQVe](https://github.com/sQVe)! - Jump to the next pane that needs you with `g a` or `Space` in
  normal mode, and to the previous one with `g A`. A pane needs you when its agent is blocked or
  done. The jump follows the sidebar order, crosses spaces and tabs, wraps, and skips spaces the
  sidebar folds away.

- [#1](https://github.com/sQVe/koja/pull/1)
  [`e70d4ed`](https://github.com/sQVe/koja/commit/e70d4edc9e2591b824320e76d287719022dfb006) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Koja's first mods: the spaces sidebar, the tab bar, the Go
  to picker, the command palette, the context menu, and the + menu, ported from the Herdr setup and
  drawn through one UI kit. A kit gallery shows every component. `bun run herdr:install` installs
  the mods, keys, settings, layout, and theme into Herdr's home as real files, and
  `bun run herdr:watch` installs on every save.

- [#8](https://github.com/sQVe/koja/pull/8)
  [`4599012`](https://github.com/sQVe/koja/commit/4599012378a0b858c11ab2a335869849afdd4ebe) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw Koja's panels, tabs, menus, and dialogs in Geist, one
  size step smaller than before. Terminals keep their own font.

- [#92](https://github.com/sQVe/koja/pull/92)
  [`df9e846`](https://github.com/sQVe/koja/commit/df9e84687d231487368a877c097b1440067d3f83) Thanks
  [@sQVe](https://github.com/sQVe)! - Add an outlined role badge to the pane header kit part and a
  `pane-headers-roles` scene that shows every Tau role and profile. The badge draws its role in the
  group's color with no fill, so "Needs you" stays the only filled pill.

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
  [@sQVe](https://github.com/sQVe)! - End each blocked or done sidebar space row with a dim age,
  including the project header that stands for the main space. The age counts from when the space
  entered that state. The shown space, and working, idle, and agent-less spaces, have no age. Koja
  saves these times, so the ages stay after a restart.

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

- [#30](https://github.com/sQVe/koja/pull/30)
  [`efaf560`](https://github.com/sQVe/koja/commit/efaf5601e64830f839c2bbcb143f78858bf3c810) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw every mod's text through the kit's text roles. The kit
  drops the medium row height, the empty state helper, and the medium font weight, and a check now
  fails when a mod sets a text size or weight itself. Menu and Changes rows shrink from 26 to 24 px,
  and gallery popup rows grow from 26 to 28 px.

- [#80](https://github.com/sQVe/koja/pull/80)
  [`a8ca9b5`](https://github.com/sQVe/koja/commit/a8ca9b56dc92639c25d7d1d9cfed1e177361f50d) Thanks
  [@sQVe](https://github.com/sQVe)! - Start the data layer in the spaces sidebar. Each sidebar copy
  claims the data lease, renews its heartbeat every 10 seconds, and publishes the empty snapshot
  while it owns the lease. A copy that stops renewing, such as after a reload, is taken over once
  its heartbeat is 30 seconds old. The kit gallery shows a Data layer section with the owner,
  generation, revision, heartbeat age, and whether the snapshot is live, stale, or unavailable.

- [#72](https://github.com/sQVe/koja/pull/72)
  [`17bdc5b`](https://github.com/sQVe/koja/commit/17bdc5b03d40184a7b976e207592544e9debb6d7) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the spaces sidebar as projects: a name header per
  project, with its machine for a remote project, and one line per space with its mark and title. A
  click on a project name folds it to its active spaces and the spaces that need you, and shows how
  many it hides. A failed PR read shows `Could not read PRs` with Retry under its project. The
  sidebar no longer shows machine headers, the `+` button, `New space there`, the machine error
  line, PR numbers, or branches. `}` and `{` now step to the first space of the next and previous
  project.

- [#92](https://github.com/sQVe/koja/pull/92)
  [`df9e846`](https://github.com/sQVe/koja/commit/df9e84687d231487368a877c097b1440067d3f83) Thanks
  [@sQVe](https://github.com/sQVe)! - Show the Tau role badge in a Pi pane's header. The badge names
  the terminal's `tau.role` label, or else its `tau.profile` label, and a pane with neither label
  keeps its plain header. The pane name stays the same.

- [#8](https://github.com/sQVe/koja/pull/8)
  [`4599012`](https://github.com/sQVe/koja/commit/4599012378a0b858c11ab2a335869849afdd4ebe) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw each repository as one label row with its name, its
  branch, and the age of its last commit. The main checkout no longer has its own row, and selecting
  the label opens that checkout's space. A folded repository shows its label dimmed, with the count
  of hidden rows. The sidebar no longer draws the Spaces header, its + button, or folder icons, and
  selected rows are rounded pills. Labels use the small semibold text size, a gap sits above each
  repository group, and every space row shows its status dot before its title.

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

- [#3](https://github.com/sQVe/koja/pull/3)
  [`06e57fe`](https://github.com/sQVe/koja/commit/06e57fe50cbf8e850b7711b4c90dc9f186413134) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw each pane as a rounded card with a 6 px gap and a faint
  outline that turns blue on the focused pane. A new `koja-pane` header replaces Herdr's: it paints
  no background, so the card's rounded corners stay clean, and it shows the focused pane's title in
  full color and the others dimmer. The tab bar no longer draws minimize, maximize, and close
  buttons.

- [#24](https://github.com/sQVe/koja/pull/24)
  [`2796f18`](https://github.com/sQVe/koja/commit/2796f1887b297ef73bd6074bc509f52fd086023c) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the Mock scenes mod. Open it, type a scene name, and press
  Enter to show that scene in a fixed window built from fake data. An unknown name shows an error
  that lists the known scenes.

- [#6](https://github.com/sQVe/koja/pull/6)
  [`189acd7`](https://github.com/sQVe/koja/commit/189acd7d8d86c46c508791ee2bca0bec2cc8736f) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Koja's own normal mode. `ctrl-b` opens an invisible
  `koja-modal` overlay that holds the keyboard, and the Neovim key table drives panes, tabs, spaces,
  agents, the palette, and the picker. Normal mode stays open after a command, `i`, `a`, and `Enter`
  return to the pane, and the `koja-tabs` mode dot shows while it is open. It replaces the personal
  `modal` and `modal-pill` mods.

- [#3](https://github.com/sQVe/koja/pull/3)
  [`06e57fe`](https://github.com/sQVe/koja/commit/06e57fe50cbf8e850b7711b4c90dc9f186413134) Thanks
  [@sQVe](https://github.com/sQVe)! - Use a new gray light theme, `catppuccin-latte-muted`, for
  every layout. Terminals have 4 px of vertical and 10 px of horizontal padding, and the first tab
  starts at the sidebar's edge unless the macOS window buttons need the room.

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

- [#43](https://github.com/sQVe/koja/pull/43)
  [`0bb0481`](https://github.com/sQVe/koja/commit/0bb04817204896675a65400bfed36b9021729d4b) Thanks
  [@sQVe](https://github.com/sQVe)! - In normal mode, `s f` and `ä` open the picker, and
  `space space` no longer does. The palette hint for the picker reads `s f`. Normal mode also tints
  the focused pane's header and draws its title and icon in the accent color, because Herdr draws no
  focus border while normal mode holds the keyboard.

- [#112](https://github.com/sQVe/koja/pull/112)
  [`db0eb85`](https://github.com/sQVe/koja/commit/db0eb857182c02311536a34c094f99c9ed9bc23d) Thanks
  [@sQVe](https://github.com/sQVe)! - Lead each tab and pane header with the mark that says why it
  needs you: the question bubble for an ask, the check for an unseen finished turn, and the spinner
  while an agent works. A tab or header with nothing to say keeps its program icon. The mark takes
  the program icon's place, so neither surface draws a second mark at its end.

  The kit also draws a red triangle alert for a crash. It shows once a crash fact reaches the kit.

- [#14](https://github.com/sQVe/koja/pull/14)
  [`fadadb6`](https://github.com/sQVe/koja/commit/fadadb6692f7989da23ee4ba23a59b2819137453) Thanks
  [@sQVe](https://github.com/sQVe)! - Port the Changes panel to a Koja mod drawn through the UI kit.

- [#31](https://github.com/sQVe/koja/pull/31)
  [`8d29417`](https://github.com/sQVe/koja/commit/8d294177c2691ef700f80b7c2dfdd051d7835319) Thanks
  [@sQVe](https://github.com/sQVe)! - Show Koja's normal-mode keys as plain key hints in the
  palette, `koja-menu`, and `koja-new-menu`, such as `Ctrl+W V` for splitting a pane right. A
  `global` binding for the same action still wins.

- [#17](https://github.com/sQVe/koja/pull/17)
  [`cecca4f`](https://github.com/sQVe/koja/commit/cecca4fba92b5372a197f2d4a00528b8d12e7d10) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the repository name that heads each group in the spaces
  sidebar in bold. Koja now installs Geist SemiBold and Bold, because Herdr bundles only Geist
  Regular, so semibold and bold text draws in its real weight.

### Patch Changes

- [#53](https://github.com/sQVe/koja/pull/53)
  [`c464ed6`](https://github.com/sQVe/koja/commit/c464ed6a48d4fb7fafa53bfbe636c93b31694137) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The command palette has a QA recipe for
  agents that test it in the sandbox.

- [#73](https://github.com/sQVe/koja/pull/73)
  [`7bf875a`](https://github.com/sQVe/koja/commit/7bf875a166ac012efea3503aa6bb9ed20858affa) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw a project's main checkout as its header in the spaces
  sidebar instead of as a second row with the same name. The header shows that space's agent mark,
  and a click on it selects the space. A chevron on hover folds the project. A project without a
  main checkout keeps folding on a click on its name. `}` and `{` and the list cursor stop on the
  header.

- [#85](https://github.com/sQVe/koja/pull/85)
  [`7cf527c`](https://github.com/sQVe/koja/commit/7cf527c77cec19abdc019d209ba776f337b842b1) Thanks
  [@sQVe](https://github.com/sQVe)! - Cancel a folder watch when Koja stops showing its folder. The
  Changes panel cancels its watch when it moves to another repository or closes. The spaces sidebar
  cancels the watch of a repository no space uses any more, and all its watches when it closes. A
  cancelled watch starts no refresh, so Koja no longer holds watches against Herdr's limit of 64.

- [#96](https://github.com/sQVe/koja/pull/96)
  [`e709279`](https://github.com/sQVe/koja/commit/e7092791d0a06a1086fcae75ff3e5f75cc45200e) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the role badge in a pane header as a solid chip in its
  role color, with label text that stays readable on that fill. The architect badge now uses a color
  of its own, apart from lead.

- [#33](https://github.com/sQVe/koja/pull/33)
  [`c684535`](https://github.com/sQVe/koja/commit/c684535af84a59e6402cd0ef8632de0b64a82005) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the previous Changes list when a refresh fails, show a
  stale line with its age and a Retry, and disable Commit until the same repository reads again. A
  failed first read and a failed folder watch now show their own error lines. A file change during a
  read now starts another read before Commit turns on, so Commit never stages files the list does
  not show. The Changes list draws its text and rows through the kit.

- [#13](https://github.com/sQVe/koja/pull/13)
  [`8d7f4b8`](https://github.com/sQVe/koja/commit/8d7f4b8e080f17db5a2252d9a2a89520e92538e3) Thanks
  [@sQVe](https://github.com/sQVe)! - Make Tab and Shift-Tab in normal mode step through the spaces
  in the order the sidebar shows, wrapping at both ends. Spaces hidden in a folded repository or a
  folded machine are skipped. When the sidebar order is not known, Tab and Shift-Tab still run
  Herdr's next and previous space.

- [#91](https://github.com/sQVe/koja/pull/91)
  [`a227174`](https://github.com/sQVe/koja/commit/a227174032a79ebfb2d9f0a6e97f0699d4ef500c) Thanks
  [@sQVe](https://github.com/sQVe)! - The sidebar's git facts come from the shared data owner.

- [#11](https://github.com/sQVe/koja/pull/11)
  [`985fd29`](https://github.com/sQVe/koja/commit/985fd290bf97fd97ee371543c008886d56841932) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode moves between panes with the arrow keys, alone or
  after `ctrl-w`, the same as `ctrl-h/j/k/l` and `ctrl-w h/j/k/l`.

- [#77](https://github.com/sQVe/koja/pull/77)
  [`364f1cf`](https://github.com/sQVe/koja/commit/364f1cf93c194859264fe4d22380db7e5c34e878) Thanks
  [@sQVe](https://github.com/sQVe)! - Fix Tab and Shift-Tab status filtering in the picker after
  startup, so Tab no longer moves focus away from search and prevents Escape from closing the
  picker.

- [#50](https://github.com/sQVe/koja/pull/50)
  [`4b9250c`](https://github.com/sQVe/koja/commit/4b9250ce9661bbb92ee428afa2d4d026ff024253) Thanks
  [@sQVe](https://github.com/sQVe)! - Clarify content-pane sources, agent references, check
  freshness, and review send states. Align review gutters and file controls, and add comment counts
  and thread context. Show unsaved comments and the review folder recovery path. Make Retry save the
  main action after a failed save and keep stale check ages visible. Distinguish edited lines from
  commented lines and restore draft review comment totals. Align section body text and keep ticket
  states beside their items. Put PR checks and threads before description and files.

- [#79](https://github.com/sQVe/koja/pull/79)
  [`1a19cfd`](https://github.com/sQVe/koja/commit/1a19cfd33c3e8cbd37b77aa8b32242b9a4aa2857) Thanks
  [@sQVe](https://github.com/sQVe)! - Read a folder's git identity through one rule for every
  surface. A checkout is the main one when its git folder is the repository's common folder, which
  also covers checkouts made with `git clone --separate-git-dir`. A failed git command is a failed
  read, never an empty repository. The Changes view and the worktree dialog show git's error when
  git cannot read the folder.

- [#56](https://github.com/sQVe/koja/pull/56)
  [`c0651df`](https://github.com/sQVe/koja/commit/c0651df4869dfd006566925e13ff675d1b1ba37f) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. `bun run sandbox identity` tells
  whether a running sandbox serves the checkout's current mods and config, and the installer records
  the checkout it installed from and whether every mod check passed. The repository has a QA guide,
  `.pi/qa.md`, and the command palette's QA recipe moved next to it, so the build no longer filters
  QA recipes.

- [#106](https://github.com/sQVe/koja/pull/106)
  [`d78a194`](https://github.com/sQVe/koja/commit/d78a19443cbdb93632646f0138f31f173f4d0cb5) Thanks
  [@sQVe](https://github.com/sQVe)! - Title an unnamed sidebar space with the Linear ticket of its
  branch, then its PR title, then the space name.

- [#7](https://github.com/sQVe/koja/pull/7)
  [`675f1a2`](https://github.com/sQVe/koja/commit/675f1a27cca46b4ae5b558f1362165ca51bed72c) Thanks
  [@sQVe](https://github.com/sQVe)! - Koja now computes space and tab status for the sidebar, tab
  bar, and picker with one shared rollup. It counts working and blocked sub-agents that have no
  pane, at any depth.

- [#102](https://github.com/sQVe/koja/pull/102)
  [`c133c20`](https://github.com/sQVe/koja/commit/c133c209d2f67579f24e8168d525dcbedefa019a) Thanks
  [@sQVe](https://github.com/sQVe)! - Koja reads what each pull request needs every minute and soon
  after a push.

- [#11](https://github.com/sQVe/koja/pull/11)
  [`985fd29`](https://github.com/sQVe/koja/commit/985fd290bf97fd97ee371543c008886d56841932) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode accepts Neovim's ctrl versions of the `ctrl-w`
  keys, such as `ctrl-w ctrl-v` to split right and `ctrl-w ctrl-w` to move to the next pane.
  `ctrl-w ctrl-c` cancels, as in Neovim.

- [#43](https://github.com/sQVe/koja/pull/43)
  [`0bb0481`](https://github.com/sQVe/koja/commit/0bb04817204896675a65400bfed36b9021729d4b) Thanks
  [@sQVe](https://github.com/sQVe)! - The pane header's split, zoom, and close buttons now show a
  tooltip and carry an accessible name.

- [#46](https://github.com/sQVe/koja/pull/46)
  [`1bd4916`](https://github.com/sQVe/koja/commit/1bd491612f248d4cdadff5442c90cb7911a6e577) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the sidebar design as mock scenes: `direction-koja` now
  shows the Projects view, and `sidebar-inbox`, `sidebar-hover`, `sidebar-find`, and
  `sidebar-states` show the Inbox, the stack hover card, the picker search for a PR, and the
  machine, folded, and failed-read states. The shell scene draws the new sidebar. The kit gains six
  icons for what a space's agent or pull requests need.

- [#92](https://github.com/sQVe/koja/pull/92)
  [`df9e846`](https://github.com/sQVe/koja/commit/df9e84687d231487368a877c097b1440067d3f83) Thanks
  [@sQVe](https://github.com/sQVe)! - Show a role badge's full label while the pane header has room.
  When space runs out, the folder and branch give up their space first, then a long label such as
  `integration-test-runner` cuts at the end with an ellipsis and shows in full on hover. Built-in
  role names stay whole while the header has room; when the controls need the space, the badge cuts
  below the built-in width so they stay in the pane, and the full name stays in the tooltip. The
  pane name keeps its space. A narrow pane header switches to the kit's compact pane actions button.
  That button stays visible and its menu lists the pane's task, branch, and folder above the four
  actions.

- [#26](https://github.com/sQVe/koja/pull/26)
  [`1af6af4`](https://github.com/sQVe/koja/commit/1af6af444896698747f3ccf2da112d2297769cfd) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode scrolls the focused pane's history with Neovim's
  keys: `ctrl-u` and `ctrl-d` for half a page, `ctrl-b` and `ctrl-f` for a page, `ctrl-y` and
  `ctrl-e` for a line, and `gg` and `G` for the top and bottom.

- [#15](https://github.com/sQVe/koja/pull/15)
  [`1f7d2bf`](https://github.com/sQVe/koja/commit/1f7d2bfa9f36b7cfbb38ac2ae6ec1ee7b61df8a2) Thanks
  [@sQVe](https://github.com/sQVe)! - Mark sidebar spaces with no agent with a hollow ring in their
  status slot, in full rows and in the narrow rail.

- [#50](https://github.com/sQVe/koja/pull/50)
  [`4b9250c`](https://github.com/sQVe/koja/commit/4b9250ce9661bbb92ee428afa2d4d026ff024253) Thanks
  [@sQVe](https://github.com/sQVe)! - Add Rail content-pane mock scenes for draft reviews, pull
  requests, and tickets. Show failed saves, sent reviews, narrow reviews, stale checks, read errors,
  loading, long content, and normal mode. Keep each outside target linked once. The `shell-content`
  scene shows the pull request pane beside the agent in the shell window.

- [#47](https://github.com/sQVe/koja/pull/47)
  [`1dc22e2`](https://github.com/sQVe/koja/commit/1dc22e2d2cb288da28d1113df3a8c8af15fc8826) Thanks
  [@sQVe](https://github.com/sQVe)! - Add mock scenes of Koja's overlays in the chosen visual
  direction: `overlay-palette`, `overlay-goto`, `overlay-keys`, `overlay-menu`, `overlay-new`,
  `overlay-menu-normal`, and `overlay-new-normal`. The `shell` scene shows the command palette.

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

- [#18](https://github.com/sQVe/koja/pull/18)
  [`f1a60fe`](https://github.com/sQVe/koja/commit/f1a60fe8cdaf4b50bcb4c2a0bbdde5bed1ffc312) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. Tests now cover the menu, modal,
  palette, palette color, and picker (rows, matching, and preview) paths that mutation testing found
  uncovered.

- [#72](https://github.com/sQVe/koja/pull/72)
  [`17bdc5b`](https://github.com/sQVe/koja/commit/17bdc5b03d40184a7b976e207592544e9debb6d7) Thanks
  [@sQVe](https://github.com/sQVe)! - Add a shared sidebar project header with remote machine labels
  and folded-space counts. Show blocked sidebar spaces with a red question bubble while tabs and
  picker rows keep their dot.

- [#67](https://github.com/sQVe/koja/pull/67)
  [`136a83f`](https://github.com/sQVe/koja/commit/136a83f12b873105dbb5247934d687c1c6b6c8c1) Thanks
  [@sQVe](https://github.com/sQVe)! - Press `?` in normal mode to see every normal-mode key in a
  searchable help. Press `Escape` to close the help and keep using normal-mode keys.

- [#49](https://github.com/sQVe/koja/pull/49)
  [`63d9c2d`](https://github.com/sQVe/koja/commit/63d9c2df8cfff8efedf1f2eaec5fc3699ce85cf0) Thanks
  [@sQVe](https://github.com/sQVe)! - Add mock scenes of Koja's dialogs in the chosen visual
  direction: `dialog-close`, `dialog-close-normal`, `dialog-rename`, `dialog-rename-normal`,
  `dialog-wt-new`, `dialog-wt-open`, and `dialog-wt-remove`. The `shell-dialog` scene shows the
  close dialog over the shell window.

- [#86](https://github.com/sQVe/koja/pull/86)
  [`08057dc`](https://github.com/sQVe/koja/commit/08057dc611501fdb00dc558799c7ff00b133fbc4) Thanks
  [@sQVe](https://github.com/sQVe)! - In normal mode, `)` and `(` now go to the next and previous
  pane that needs you. They replace `g a`, `g A`, and `Space`, which no longer jump. Step tabs with
  `t l` and `t h`, or `g t` and `g T`.

- [#37](https://github.com/sQVe/koja/pull/37)
  [`d3efba7`](https://github.com/sQVe/koja/commit/d3efba7ed44dc792207a2212d1ac8d020c864d44) Thanks
  [@sQVe](https://github.com/sQVe)! - Draw the tab bar, pane headers, and sidebar rows through the
  kit's text roles, 24 px rows, and hover rule. Tab icons take the tab's text color, and repository
  branch names cut in the middle so the branch and age stay readable.

- [#10](https://github.com/sQVe/koja/pull/10)
  [`6b5ce04`](https://github.com/sQVe/koja/commit/6b5ce047b109711ea073ba684ab8d6f3a0c92580) Thanks
  [@sQVe](https://github.com/sQVe)! - Fix normal mode losing the keyboard after it moves focus. A
  pane, tab, or space action now takes the keyboard back as soon as Herdr applies the move, so the
  next key reaches normal mode instead of the terminal. A loss normal mode did not cause keeps the
  status check, but a `toast` no longer blocks it, lookups back off while another overlay stays
  open, stale replies are dropped, and a reply without an overlay list keeps the current keyboard
  owner. When a palette or picker closes, normal mode checks the keyboard owner at once instead of
  waiting out the backoff.

- [#22](https://github.com/sQVe/koja/pull/22)
  [`3a87eaa`](https://github.com/sQVe/koja/commit/3a87eaa8e123132ecfae290b7b2f7c6e573d6d2c) Thanks
  [@sQVe](https://github.com/sQVe)! - Normal mode moves between panes with Ctrl and an arrow key,
  the same as `ctrl-h/j/k/l`.

- [#107](https://github.com/sQVe/koja/pull/107)
  [`3a1f747`](https://github.com/sQVe/koja/commit/3a1f747f36f3b670c08982b143ff53d80811f569) Thanks
  [@sQVe](https://github.com/sQVe)! - Add a split button to the kit: one main action on the label
  and a chevron that opens a menu of other ways to act, with the current choice marked and a line
  before a different kind of action.

- [#28](https://github.com/sQVe/koja/pull/28)
  [`feec883`](https://github.com/sQVe/koja/commit/feec883c396a4a1d8384335dbd5819e6592057e8) Thanks
  [@sQVe](https://github.com/sQVe)! - Split the kit gallery code by section. The mods do not change;
  only the gallery's own source moves into one module per section.

- [#17](https://github.com/sQVe/koja/pull/17)
  [`cecca4f`](https://github.com/sQVe/koja/commit/cecca4fba92b5372a197f2d4a00528b8d12e7d10) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep letter spacing even in search results. Highlighted
  matches in the palette and picker no longer open small gaps inside words.

- [#100](https://github.com/sQVe/koja/pull/100)
  [`b63c519`](https://github.com/sQVe/koja/commit/b63c519f24e6f4f98d6a43796a2680baa1c5e79f) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the last good git facts when a git read or a folder watch
  fails. A layout reply whose flags are not `true` or `false` is now a failed read instead of a
  checkout. A folder change that arrives just before the next watch fails now reaches its listener,
  so the Changes view refreshes instead of showing stale facts. A refresh whose task Herdr refuses
  no longer leaves the Changes view on `Loading changes…`, and it blocks Commit until a read
  succeeds. A refused Commit clears its busy state and says so, so the view keeps reading.

- [#75](https://github.com/sQVe/koja/pull/75)
  [`e51a19e`](https://github.com/sQVe/koja/commit/e51a19ef63ac1956623e454c5573369b08740357) Thanks
  [@sQVe](https://github.com/sQVe)! - Show wait ages on blocked and done rows that are not selected
  in the sidebar reference scenes.

- [#78](https://github.com/sQVe/koja/pull/78)
  [`cee7ecc`](https://github.com/sQVe/koja/commit/cee7eccd0561fc6ca9734f5033cf133336d8f9b4) Thanks
  [@sQVe](https://github.com/sQVe)! - Dragging a space in the spaces sidebar now moves it within its
  own project and keeps the project order, even when Herdr lists spaces of other projects between
  its spaces. A row in another project and the main space header refuse the drop: they show no drop
  line and a not-allowed cursor, and a drop there moves nothing. The header itself stays first in
  its project.

- [#57](https://github.com/sQVe/koja/pull/57)
  [`497ec60`](https://github.com/sQVe/koja/commit/497ec604273de220b301dbb6f72b180cebf9c36b) Thanks
  [@sQVe](https://github.com/sQVe)! - Fix the Changes panel staying on "Loading changes" after a
  switch to another space or folder. The panel now reads the new location and shows its files or its
  state line.

- [#4](https://github.com/sQVe/koja/pull/4)
  [`2b1aace`](https://github.com/sQVe/koja/commit/2b1aaceeab2462f12bf02e571d8e599279ff7ad1) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the selected row in the terminal menu when Git actions
  load, instead of moving the highlight to a different entry.

- [#55](https://github.com/sQVe/koja/pull/55)
  [`6ce3727`](https://github.com/sQVe/koja/commit/6ce3727e8dd96fe45c11c4f32c02a24df1a473fd) Thanks
  [@sQVe](https://github.com/sQVe)! - Ask before closing a pane also ends other panes through
  terminal parent relationships, including worker tabs and descendants reached through hidden
  terminals. The dialog says "Close space?" when no pane would remain, or counts the other panes
  that will close. Escape keeps the panes running.

- [#16](https://github.com/sQVe/koja/pull/16)
  [`31ae3fd`](https://github.com/sQVe/koja/commit/31ae3fd07c528deaf7749aea94a59406e925d25f) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The tests now share one fake for each
  Herdr module and run in parallel without isolation, so they pass in any file order and in mutation
  runs.

- [#29](https://github.com/sQVe/koja/pull/29)
  [`23a4751`](https://github.com/sQVe/koja/commit/23a47518bb6b9c3f45a1f81ad9dc97a3fcf306ed) Thanks
  [@sQVe](https://github.com/sQVe)! - No change to the mods. The sidebar, Changes, and picker mods
  now keep their drawing, data reads, and preview loading in modules beside `main.ts`.

- [#32](https://github.com/sQVe/koja/pull/32)
  [`551acee`](https://github.com/sQVe/koja/commit/551acee8a447839ddb66530e2e49551bf95f1256) Thanks
  [@sQVe](https://github.com/sQVe)! - The `catppuccin-latte-muted` theme's text and status marks now
  meet WCAG 2.2 AA contrast. The "Needs you" badge label draws in the dark foreground color. The
  diff hunk header, the diff line numbers, and the disabled action button label use the darker muted
  color. A hovered solid or danger button draws a ring instead of fading its fill and label.

- [#103](https://github.com/sQVe/koja/pull/103)
  [`10503ee`](https://github.com/sQVe/koja/commit/10503eec46283cd74642df7a7f29c4f2c598d975) Thanks
  [@sQVe](https://github.com/sQVe)! - Return in the Changes commit field now commits once a read in
  flight finishes, instead of dropping the request and leaving the files uncommitted.

- [#61](https://github.com/sQVe/koja/pull/61)
  [`3c5e260`](https://github.com/sQVe/koja/commit/3c5e2605e17eb3cec2761ed2db3939cdd650ced1) Thanks
  [@sQVe](https://github.com/sQVe)! - Add twelve ticket view mock scenes for the selected plan
  layout, including loading, read failures, blocked and completed plans, tikk, long plans, and wide
  and normal-mode views. Keep source status separate from readiness, show the completed state with a
  check, and put wide-view guidance in the rail.

- [#69](https://github.com/sQVe/koja/pull/69)
  [`d7bae70`](https://github.com/sQVe/koja/commit/d7bae701bcf236d524339f7101038e9f0b08159f) Thanks
  [@sQVe](https://github.com/sQVe)! - Remove the sidebar's narrow rail. The sidebar keeps full rows
  and stops shrinking at 200 px.

- [#25](https://github.com/sQVe/koja/pull/25)
  [`2c62b7a`](https://github.com/sQVe/koja/commit/2c62b7a4a54389953dcd525de154440221a8a4cc) Thanks
  [@sQVe](https://github.com/sQVe)! - Add four palette smoke scenes to the Mock scenes mod, used to
  check the judge-mock skill.

- [#74](https://github.com/sQVe/koja/pull/74)
  [`a69d7e4`](https://github.com/sQVe/koja/commit/a69d7e4fba68b5564ca9ac585590dcdbaef7d71d) Thanks
  [@sQVe](https://github.com/sQVe)! - Show a space or tab as working while any pane or sub-agent in
  it still runs. It shows done only after all work in it stops. Blocked work still takes priority
  over both.

- [#81](https://github.com/sQVe/koja/pull/81)
  [`1aa7ff5`](https://github.com/sQVe/koja/commit/1aa7ff5f01ea99871110b57130ed4f429d486642) Thanks
  [@sQVe](https://github.com/sQVe)! - Idle sidebar rows and rows without an agent no longer show an
  age. Showing or leaving a space no longer resets any age, and a last-shown time saved by an
  earlier build is ignored.

- [#113](https://github.com/sQVe/koja/pull/113)
  [`9013cb0`](https://github.com/sQVe/koja/commit/9013cb03383f3ac2af684f828ab16dd49b71407a) Thanks
  [@sQVe](https://github.com/sQVe)! - Give the PR Retry lifecycle one owner-side session, so the
  scheduler, the stored records, and the outcome writer no longer each carry a copy of the protocol.

- [#99](https://github.com/sQVe/koja/pull/99)
  [`f90cf0b`](https://github.com/sQVe/koja/commit/f90cf0b1ee433e0d07ad98ee9e1e058f1dbbec34) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the gap between a pane header's hover buttons when the
  header has no task and no status mark. A pane header now reserves room for those buttons at the
  gap it draws them with, so a narrow header switches to its menu instead of clipping the last
  button.

- [#51](https://github.com/sQVe/koja/pull/51)
  [`ea49267`](https://github.com/sQVe/koja/commit/ea4926773eca1d05c040bbbf6e690eb6b0d353bb) Thanks
  [@sQVe](https://github.com/sQVe)! - Add attention mock scenes for agent asks: a card in the
  focused pane that shows the whole question and any command, a list of other asks, and the
  normal-mode `g n` hint. Show the card and the list inside the shell mock's focused pane.

- [#40](https://github.com/sQVe/koja/pull/40)
  [`a4d2791`](https://github.com/sQVe/koja/commit/a4d27912ab804f2fad647a836040d355cb731f57) Thanks
  [@sQVe](https://github.com/sQVe)! - Add two mock scenes of Koja's chosen visual direction,
  `direction-koja` for insert mode and `direction-koja-normal` for normal mode. They draw the whole
  window from their own set of colors and sizes. Pane headers in the shell scene now show the branch
  and the folder together.

- [#21](https://github.com/sQVe/koja/pull/21)
  [`b7f3f34`](https://github.com/sQVe/koja/commit/b7f3f34674ee6043683dab13b628f94bb8144bef) Thanks
  [@sQVe](https://github.com/sQVe)! - Name an unnamed tab whose terminals all carry a Tau task by
  that task. A tab with one worker shows its task, and a tab with several shows the first task and a
  count of the others, such as "Fix status counts +2". The tab bar and the picker both use the new
  name, and the picker search matches it.

- [#85](https://github.com/sQVe/koja/pull/85)
  [`7cf527c`](https://github.com/sQVe/koja/commit/7cf527c77cec19abdc019d209ba776f337b842b1) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep the sidebar, tab bar, and command palette available when
  a saved value contains invalid JSON. Use first-launch defaults for the damaged value and allow
  later changes to save normally.

- [#100](https://github.com/sQVe/koja/pull/100)
  [`b63c519`](https://github.com/sQVe/koja/commit/b63c519f24e6f4f98d6a43796a2680baa1c5e79f) Thanks
  [@sQVe](https://github.com/sQVe)! - Keep a trailing space in a git path. Koja trimmed the last
  space from every path git printed, so a checkout folder such as `checkout ` was read with a
  shortened worktree path and a worktree key that did not match the folder.

- [#4](https://github.com/sQVe/koja/pull/4)
  [`2b1aace`](https://github.com/sQVe/koja/commit/2b1aaceeab2462f12bf02e571d8e599279ff7ad1) Thanks
  [@sQVe](https://github.com/sQVe)! - Round the backgrounds of the command palette, the terminal
  menu, and the new tab menu to Herdr's popup frame, so their corners no longer show a square dot.

- [#85](https://github.com/sQVe/koja/pull/85)
  [`7cf527c`](https://github.com/sQVe/koja/commit/7cf527c77cec19abdc019d209ba776f337b842b1) Thanks
  [@sQVe](https://github.com/sQVe)! - Start no process and write no file during `herdr-app check`.
  The Changes panel, the spaces sidebar, the space menu, the new menu, the worktree dialog, the
  picker's preview, and normal mode's keyboard hold now skip their git, gh, grove, shell,
  `herdr-app status`, `mktemp`, `rm`, and file writes while Herdr checks a mod.

- [#64](https://github.com/sQVe/koja/pull/64)
  [`58eecbf`](https://github.com/sQVe/koja/commit/58eecbf13bcebec88ad2d224bfea81e6d958e1a3) Thanks
  [@sQVe](https://github.com/sQVe)! - Step with the bracket keys in normal mode: `]` and `[` for
  spaces, `)` and `(` for tabs, and `}` and `{` for the main space of the next and previous
  repository in the sidebar. The palette and the menus now show the one-key alias of an action that
  has one.

- [#62](https://github.com/sQVe/koja/pull/62)
  [`0e3c6bd`](https://github.com/sQVe/koja/commit/0e3c6bd588c8a60239318a05911c43ebebc7eb17) Thanks
  [@sQVe](https://github.com/sQVe)! - Add six mock scenes of a pane header that shows the keyboard
  mode: `header-mode-insert`, `header-mode-normal`, `header-mode-pending`, `header-mode-split`,
  `header-mode-split-normal`, and `header-mode-lone`. The focused pane's header shows the mode as a
  flat tag and each pending key as a keycap, and the tab bar draws no mode pill. In normal mode only
  the focused pane draws the accent border. A shell pane with no agent shows the idle dot. A narrow
  header cuts and then drops the task, shortens the folder to its last segment, cuts the branch in
  its middle, and last drops the folder. The mods stay as they are.

- [#105](https://github.com/sQVe/koja/pull/105)
  [`d5da7b9`](https://github.com/sQVe/koja/commit/d5da7b9c39302d00977249a5b11cc459c16f17d5) Thanks
  [@sQVe](https://github.com/sQVe)! - In normal mode, `g p` opens the picker, and `s f` no longer
  does. The picker lists spaces, tabs, and panes, so it is a place to go to and its key sits under
  `g`, as ADR 0012's procedure says. `ä` still opens it. The palette mock scene lists the row under
  `g` with the new keys.

- [#90](https://github.com/sQVe/koja/pull/90)
  [`b472e51`](https://github.com/sQVe/koja/commit/b472e5140b454ca3474c755761013fb3587e363d) Thanks
  [@sQVe](https://github.com/sQVe)! - Read the theme once per turn, so the key help and the gallery
  render inside Herdr's deadline instead of failing with `interrupted`.

- [#94](https://github.com/sQVe/koja/pull/94)
  [`7848b6a`](https://github.com/sQVe/koja/commit/7848b6a3385db028e79dd9668683427be61ab6e0) Thanks
  [@sQVe](https://github.com/sQVe)! - The sidebar's PR facts and Retry come from the shared data
  owner.

- [#104](https://github.com/sQVe/koja/pull/104)
  [`9ecf10c`](https://github.com/sQVe/koja/commit/9ecf10c36563d4c1465a061e9208f380a01f610e) Thanks
  [@sQVe](https://github.com/sQVe)! - Closing the focused space now selects the space above it in
  the sidebar. Closing the top space of the sidebar selects the space below it, and the order
  crosses projects. A close of a space without focus keeps the current focus, and so does a space
  the user selects in the same draw as the close.

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

- [#61](https://github.com/sQVe/koja/pull/61)
  [`3c5e260`](https://github.com/sQVe/koja/commit/3c5e2605e17eb3cec2761ed2db3939cdd650ced1) Thanks
  [@sQVe](https://github.com/sQVe)! - Refine ticket mock state words, plan alignment, progress
  counts, and failure guidance. Bring single-ticket acceptance into view and keep wide-view titles
  readable in the rail. Show the container ticket view beside its agent in the shared `shell-ticket`
  scene.

- [#83](https://github.com/sQVe/koja/pull/83)
  [`c0caa91`](https://github.com/sQVe/koja/commit/c0caa910b15739626a6193944f170c18d5b6f645) Thanks
  [@sQVe](https://github.com/sQVe)! - Line up every project name in the spaces sidebar. Each project
  header keeps the agent mark slot at its start, and shows its main space's mark there only while
  that space is working, blocked, or done. A header without a main checkout draws its name in a
  muted tone. Both kinds of header now end with the hidden count when folded, the main space's age
  when it has one, and then the fold chevron, which shows on hover while the project is open.

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

- [#71](https://github.com/sQVe/koja/pull/71)
  [`6d89480`](https://github.com/sQVe/koja/commit/6d894806b75d601ab312bf9988879735f2b9fa36) Thanks
  [@sQVe](https://github.com/sQVe)! - Pick a key in the key help to run it. `Down` and `Up` move the
  selected row, and `Enter` closes the help and runs the row in normal mode, as if you typed its
  keys.

- [#44](https://github.com/sQVe/koja/pull/44)
  [`365369b`](https://github.com/sQVe/koja/commit/365369b3c371fad74ad1bfb1cb83ce65d0819485) Thanks
  [@sQVe](https://github.com/sQVe)! - Stop showing "Could not read PRs." in the spaces sidebar for a
  repository without a git remote. Such a repository has no PRs, so its group shows no PR facts and
  no error line. A real failed read still shows the error line with Retry. Sidebar error lines no
  longer show a tooltip that repeats their text.

- [#59](https://github.com/sQVe/koja/pull/59)
  [`0d376d0`](https://github.com/sQVe/koja/commit/0d376d05608e93261d278b7800c2665e377734f6) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the PR view design as mock scenes: a blocked PR with its
  failing checks and review threads, a prompt tray that sends them to the agent, ready and failed
  merges, and the view in the shell window.

- [#9](https://github.com/sQVe/koja/pull/9)
  [`c48dd81`](https://github.com/sQVe/koja/commit/c48dd810f5044c8084bc65b300f95a5aa2072cb8) Thanks
  [@sQVe](https://github.com/sQVe)! - Name tabs in the Go to panel the same way as the tab bar. An
  unnamed tab shows the program it runs, such as `tuicr`, instead of `Tab 1 · <pane title>`, and its
  icon comes from that program too.

- [#83](https://github.com/sQVe/koja/pull/83)
  [`c0caa91`](https://github.com/sQVe/koja/commit/c0caa910b15739626a6193944f170c18d5b6f645) Thanks
  [@sQVe](https://github.com/sQVe)! - Add mock scenes that compare where a project header shows its
  main space's agent mark: `header-mark-name`, `header-mark-right`, `header-mark-right-active`,
  `header-mark-left-active`, `header-mark-after-name`, `header-mark-left-flat`,
  `header-mark-after-name-flat`, `header-mark-left-divider`, `header-mark-left-divider-inset`, and
  `header-mark-left-divider-soft`.

- [#38](https://github.com/sQVe/koja/pull/38)
  [`df34dd6`](https://github.com/sQVe/koja/commit/df34dd6462597ef63190f3307362d7fbad115855) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the kit's pane header part, a pane header menu, an
  icon-only toggle, and a mode pill. The pane header draws a program icon, name, task, branch, and
  folder, reveals its split, zoom, and close buttons on header hover while keeping their space, and
  shows the branch and folder in full while they fit. A field that no longer fits cuts in the middle
  down to a minimum width, then drops whole in order (folder, then branch) before the task cuts. A
  header that draws no program icon keeps that icon's width for the task. Once a field drops, or
  below a compact width, it swaps the four buttons for one visible overflow button whose menu lists
  the task, branch, and folder above the four actions. Header buttons and icon-only toggles carry
  accessible names beside their tooltips, the focused header draws a kit-owned focus fill, and the
  status mark draws done as a green check icon. Add the `shell` and `pane-headers` mock scenes,
  which draw the window shell and the header states from those parts.

- [#85](https://github.com/sQVe/koja/pull/85)
  [`7cf527c`](https://github.com/sQVe/koja/commit/7cf527c77cec19abdc019d209ba776f337b842b1) Thanks
  [@sQVe](https://github.com/sQVe)! - Move the active tab one step left with `t H` and right with
  `t L` in normal mode. The palette offers Move tab left and Move tab right.

- [#45](https://github.com/sQVe/koja/pull/45)
  [`9be948c`](https://github.com/sQVe/koja/commit/9be948c56cff40a651a442d726a47a94dce9ea75) Thanks
  [@sQVe](https://github.com/sQVe)! - Ask with Koja's own dialog before `pane.close` closes the last
  pane of a space's last tab. Normal mode `w q` on a lone pane now opens a "Close space?" dialog
  that takes Enter and Escape, and the pane header's close button opens the same dialog.

- [#89](https://github.com/sQVe/koja/pull/89)
  [`81e8cb6`](https://github.com/sQVe/koja/commit/81e8cb6e1d919f6d1046317b57dd283a33f87f64) Thanks
  [@sQVe](https://github.com/sQVe)! - Koja now follows stomme's shared rules and house style.

- [#70](https://github.com/sQVe/koja/pull/70)
  [`5a1495f`](https://github.com/sQVe/koja/commit/5a1495f86efe0088b91ff692d77580fe62b1c440) Thanks
  [@sQVe](https://github.com/sQVe)! - Add the sidebar parts to the kit: the work icon, stack
  progress, view switch, link text, selected-space footer, and hover card with its arrow. The kit
  gallery shows each one under "Sidebar parts", and the Mock scenes mod draws them as one sidebar in
  the `sidebar-parts` scene.

- [#106](https://github.com/sQVe/koja/pull/106)
  [`d78a194`](https://github.com/sQVe/koja/commit/d78a19443cbdb93632646f0138f31f173f4d0cb5) Thanks
  [@sQVe](https://github.com/sQVe)! - The data snapshot carries each repository's ticket facts, so a
  surface can show a ticket title.

- [#98](https://github.com/sQVe/koja/pull/98)
  [`732e196`](https://github.com/sQVe/koja/commit/732e196b0e46a546daa721b7701b37d702c54735) Thanks
  [@sQVe](https://github.com/sQVe)! - Name the picker's status filter in its empty message. With a
  query typed and a filter other than All, the picker said "No space matches.", which is the All
  filter's wording. It now says `Nothing in <filter> matches "<query>".`, so the list names the
  filter it is using.

- [#82](https://github.com/sQVe/koja/pull/82)
  [`d8964e0`](https://github.com/sQVe/koja/commit/d8964e065430653c694e3491b88d6ac174f50381) Thanks
  [@sQVe](https://github.com/sQVe)! - Fix sidebar project header dragging to reorder whole projects,
  including folded spaces and projects without a main checkout.
