# QA guide

Koja ships Herdr desktop mods: one window with a spaces sidebar, a tab strip, pane headers, a
Changes panel, and keyboard overlays. QA drives that window in a private sandbox, never in the
user's real Herdr window.

## Choose sections

| Section              | Test it when the change touches                                                    |
| -------------------- | ---------------------------------------------------------------------------------- |
| Normal mode keys     | `koja-modal`, `src/kit/normalKeys.ts`, `config/keys.json`                          |
| Close and rename     | `src/kit/askFirst.ts`, `askPlan.ts`, `dialog*.ts`, `koja-confirm`, `koja-prompt`   |
| Palette and picker   | `koja-palette`, `koja-picker`, `src/kit/palette.ts`, `overlay*.ts`, `shortcut*.ts` |
| Sidebar, tabs, panes | `koja-spaces`, `koja-tabs`, `koja-pane`, `koja-menu`, `koja-new-menu`              |
| Changes panel        | `koja-changes`, `src/kit/fileStatus.ts`, the panel memory in `koja-tabs`           |
| Gallery and scenes   | `koja-gallery`, `koja-mocks`, `scripts/capture.ts`                                 |

Cross-effects:

- The build puts the kit inside each bundle, so a change in `src/kit/` reaches every mod that
  imports the file. For `size.ts`, `text*.ts`, `theme*.ts`, `icon*.ts`, `listRow.ts`, `button.ts`,
  or `config/themes/`, assign all sections.
- Close and rename start from normal mode, the palette, the menus, the tab strip, and the pane
  header. A change to any of those entry points needs "Close and rename".
- `src/kit/spaceOrder.ts` changes both the sidebar order and where `s j`, `s k`, and `Tab` go.
- `src/kit/statusRollup.ts` and `paneHeader*.ts` change the sidebar, the tabs, and the pane headers.
- `config/keys.json` and `config/layouts/koja.json` are installed as they are. A key or layout
  change can break a mod that no source file touched.
- `scripts/build.ts`, `scripts/install.ts`, and `herdr/*.d.ts` change what every mod gets. Assign
  "Normal mode keys" plus the sections of the mods the change names.
- A scene in `koja-mocks` uses fake data. It never proves the real mod.

- Changes only to tests, documents, changesets, or the sandbox scripts need no `qa` launch.
- When the impact on a section is unclear, include the section.

## Before a launch

For the manager. The `qa` worker starts nothing.

The manager starts:

- The sandbox. Run `bun run sandbox guide` and follow its rules for every session and for the
  session that starts the sandbox. They cover the name.
  - Start: `RUTA_NAME=<name> bun run sandbox up`, from the worktree.
  - After a later edit: `RUTA_NAME=<name> bun run sandbox install`.
  - Check: `RUTA_NAME=<name> bun run sandbox identity` exits 0. It runs `ruta status` first.
  - Stop, when the worker has reported: `RUTA_NAME=<name> bun run sandbox down`.
- The fixtures, under `/var/tmp/ruta-<name>/home/`: an empty `.zshrc`, a Git repository with one
  commit and uncommitted changes, a clean one, and a folder that is no repository. Set `user.name`
  and `user.email` in each repository. Open a space on each with
  `RUTA_NAME=<name> bun run sandbox do space.new --folder <path>`, with two tabs and a split in one.
  `sandbox down` deletes them.

Ask the user:

- Nothing. No step reads a secret, costs money, or touches shared state.

Give the brief these lines: `Sandbox: <name>`, the fixture paths, and `Data writes: allowed` or
`not allowed`. Give one sandbox to one worker at a time.

## Rules for every section

- The name is on the brief's `Sandbox:` line. Without that line, ask the parent.
- From the worktree, run `RUTA_NAME=<name> bun run sandbox guide`, or `RUTA_NAME=<name> ruta guide`.
  Follow its rules for every session and for a session that did not start the sandbox. The rules
  below add to them.
- Run each ruta command of that guide as `bun run sandbox <command>`, except `status`.
  `bun run sandbox` alone prints the arguments of each command.
- For the `ruta status` that the guide asks for before any input, run `bun run sandbox identity`. It
  runs `ruta status` first and prints its line. Then it checks the installed mods and config against
  the worktree, and prints `sandbox <name> has the current mods and config of <worktree path>`. It
  must exit 0. On any other result, stop and ask the parent.
- `bun run sandbox status` is not `ruta status`. It prints the status of the window, from
  `herdr-app status`, and changes nothing.
- Never run `sandbox install`, `bun run build`, `bun run herdr:install`, or `bun run herdr:watch`.
  `sandbox install` builds the mods.
- Read each coordinate from a new `bun run sandbox shot <file outside the worktree>`. Button 3 is
  the right button. Keysyms are case sensitive: `Return`, `Escape`, `BackSpace`, `Page_Down`.
- `key` adds no Shift. Use `type` for `:`, `?`, and capital letters, `key slash` for `/`, and
  `key Tab Shift_L` for shift-tab.
- Typed text goes to whatever has the keyboard. Take a shot before `type` or `key Return`, so that
  no text lands in a terminal.
- Use `bun run sandbox do` or `bun run sandbox hc` only when a section or the brief names the exact
  command. They skip the keys and clicks a user has.
- The sandbox is no file system jail. Work only in the fixture paths of the brief. Never open a
  space or a terminal on a real checkout, create or remove a worktree outside the fixtures, launch
  an agent, connect a machine, or type a shell command that the brief does not list.
- A data write is a commit, a worktree action, a rename, or a close. Follow the brief's
  `Data writes` line; no recipe grants it. Palette Recent and picker history are no data write.
- Never run `Quit Herdr`, `Close window`, `Reset to the default screen`, `Duplicate mod`, or
  `Duplicate layout`. They end the sandbox or change its installed files.
- Never run `herdr-app` or `hc` outside `bun run sandbox`.

## Normal mode keys

### What to check

- `key b Control_L` enters normal mode, and the focused pane header gets its tint. `i`, `a`, or
  `Return` leaves it, and the terminal takes typed text again.
- `h` `j` `k` `l` and the arrows move focus. `H` `J` `K` `L` swap panes. `w v` and `w s` split,
  `w m` zooms and restores, and `w w` and `w W` step through the panes of the tab.
- `t n` opens a tab. `t h`, `t l`, `t 1` to `t 9`, and `g t` select tabs. `s j`, `s k`, and `Tab`
  step spaces in sidebar order. `z s` hides and shows the sidebar.
- Normal mode stays on after a dialog, the palette, or the picker closes. `/` opens terminal search
  and leaves normal mode. `?` opens help.

## Close and rename

### What to check

- `w q` closes only the focused pane, with no dialog, when the pane has siblings. On the last pane
  of the last tab, the dialog is `Close space?` with the space name, tab count, and terminal count.
- `s q` always asks. `t q` asks only on the last tab of a space. `Escape` cancels, and every space,
  tab, and pane is still there. `Close` ends exactly what the dialog named.
- The same dialogs come from the palette, the menus, the tab's close button, and the pane header.
- `t r` and `s r` open a rename prompt. It holds the current name, or nothing for a tab or space
  with an automatic name. `Escape` keeps the name. An empty name brings the automatic name back.

## Palette and picker

### What to check

- `:` and `BackSpace` open the palette from normal mode. A query filters, `Return` or a click runs
  the entry, `Escape` cancels, and Recent shows the entry on the next open.
- `s f` opens the picker. A query filters, `Tab` and shift-tab change the filter, `Return` goes to
  the row, and `Escape` returns focus to the pane that had it.
- The picker preview follows the selection and types nothing into the source terminal.

### Recipes

- [Command palette](qa/palette.md): all entry points, list movement, and Recent.

## Sidebar, tabs, panes

### What to check

- The sidebar lists every space. A click selects a space. A drag changes the order, and `s j`
  follows the new order.
- The tab strip shows the tabs of the selected space. A click selects, a drag reorders, and the plus
  button opens the New menu.
- Each pane has a header with its label, and the focused pane has the accent border.
- A right click on a space or a tab opens a menu for that item, not for the focused one.
- The New menu lists terminal, agent, space, and worktree choices. Read it; launch nothing.

## Changes panel

### Use it safely

- Commit stages every change of the focused pane's repository. Never type in the message field or
  press the Commit button outside a fixture repository.

### What to check

- The Changes button in the tab strip shows and hides the panel. Each space keeps its choice after a
  switch away and back.
- The panel lists the changed files of the focused pane's repository, and a click on a file shows
  its diff.

## Gallery and scenes

### What to check

- The palette entry `Kit gallery` opens the gallery.
- `bun run sandbox do mod.open --name koja-mocks` opens the scene picker. After one second, a scene
  name from `src/mods/koja-mocks/catalog.ts` and `Return` open that scene. An unknown name shows an
  error. `Escape` closes the scene.
- `bun run mock:capture <scene> <new folder outside the worktree>` writes `shot.png`, `crop.png`,
  and `capture.json`, and closes the scene. It refuses when a `koja-mocks` overlay is open.

## Not testable

- The `ö` and `ä` keys of normal mode: the sandbox keyboard cannot type them.
- A double click, such as the rename of a tab: the sandbox input sends single clicks only.
- A pane close that also ends other panes: no fixture step makes a terminal with a live child
  terminal in another pane.
- Agent launch, agent status, machines, and pull request rows: they need real agents, SSH, and
  GitHub, and the sandbox has no fake source for them.
- `sandbox up`, `restart`, `install`, and `down`, the build, and the installer: the `qa` worker may
  not run them.
- The look of a scene: the judge-mock skill gates it.
