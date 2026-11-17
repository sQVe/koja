# QA guide

Koja ships Herdr desktop mods: one window with a spaces sidebar, a tab strip, pane headers, a
Changes panel, and keyboard overlays. QA drives that window in a private sandbox, never in the
user's real Herdr window.

## Choose sections

| Section              | Test it when the change touches                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Normal mode keys     | `koja-modal`, `src/kit/normalKeys.ts`, `config/keys.json`                                       |
| Close and rename     | `src/kit/askFirst.ts`, `askPlan.ts`, `dialog*.ts`, `koja-confirm`, `koja-prompt`                |
| Palette and picker   | `koja-palette`, `koja-picker`, `koja-help`, `src/kit/palette.ts`, `overlay*.ts`, `shortcut*.ts` |
| Sidebar, tabs, panes | `koja-spaces`, `koja-tabs`, `koja-pane`, `koja-menu`, `koja-new-menu`, `koja-worktree`          |
| Changes panel        | `koja-changes`, `src/kit/fileStatus.ts`, the panel memory in `koja-tabs`                        |
| Gallery and scenes   | `koja-gallery`, `koja-mocks`, `scripts/capture.ts`                                              |

Cross-effects:

- The build puts the kit inside each bundle, so a change in `src/kit/` reaches every mod that
  imports the file. For `size.ts`, `text*.ts`, `theme*.ts`, `icon*.ts`, `listRow.ts`, `button.ts`,
  or `config/themes/`, assign all sections.
- Close and rename start from normal mode, the palette, the menus, the tab strip, and the pane
  header. A change to any of those entry points needs "Close and rename".
- `src/kit/spaceOrder.ts` changes both the sidebar order and where `s j` and `s k` go.
- `src/kit/section.ts` names the sections and list commands that `koja-modal` sends and
  `koja-spaces` runs. A change there needs "Normal mode keys" and "Sidebar, tabs, panes".
- `src/kit/statusRollup.ts` and `paneHeader*.ts` change the sidebar, the tabs, and the pane headers.
- `src/data/` runs inside `koja-spaces` and is shown by `koja-gallery`. A change there needs
  "Sidebar, tabs, panes" and "Gallery and scenes".
- `config/keys.json` and `config/layouts/koja.json` are installed as they are. A key or layout
  change can break a mod that no source file touched.
- `scripts/build.ts`, `scripts/install.ts`, and `herdr/*.d.ts` change what every mod gets. Assign
  "Normal mode keys" plus the sections of the mods the change names.
- A scene in `koja-mocks` uses fake data. It never proves the real mod.

No launch, and unclear impact:

- Changes only to tests, documents, changesets, or the sandbox scripts need no `qa` launch.
- When the impact on a section is unclear, include the section.

## Journeys

| Journey                                                                           | Goal                                               | Run it when the change touches                                                                | Test    |
| --------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- |
| [Triage the spaces that need you](qa/journeys/triage-the-spaces-that-need-you.md) | Read one-line space rows and switch spaces.        | `src/mods/koja-spaces/`, `src/kit/space.ts`, `src/kit/statusMark.ts`, `src/kit/spaceOrder.ts` | by hand |
| [Recover from a failed PR read](qa/journeys/recover-from-a-failed-pr-read.md)     | Retry a failed read without losing the space rows. | `src/mods/koja-spaces/`, `src/kit/stateLine.ts`, `src/kit/button.ts`                          | by hand |

## Features

| Feature                                                       | Section              | Target  | Update it when the change touches                                                      |
| ------------------------------------------------------------- | -------------------- | ------- | -------------------------------------------------------------------------------------- |
| [Normal mode keys](qa/features/normal-keys.md)                | Normal mode keys     | sandbox | `koja-modal`, `src/kit/normalKeys.ts`, `config/keys.json`                              |
| [Close and rename](qa/features/close-and-rename.md)           | Close and rename     | sandbox | `src/kit/askFirst.ts`, `askPlan.ts`, `dialog*.ts`, `koja-confirm`, `koja-prompt`       |
| [Command palette](qa/features/palette.md)                     | Palette and picker   | sandbox | `koja-palette`, `koja-help`, `src/kit/palette.ts`, `overlay*.ts`, `shortcut*.ts`       |
| [Picker](qa/features/picker.md)                               | Palette and picker   | sandbox | `koja-picker`, `src/kit/palette.ts`, `overlay*.ts`                                     |
| [Sidebar, tabs, and panes](qa/features/sidebar-tabs-panes.md) | Sidebar, tabs, panes | sandbox | `koja-spaces`, `koja-tabs`, `koja-pane`, `koja-menu`, `koja-new-menu`, `koja-worktree` |
| [Changes panel](qa/features/changes-panel.md)                 | Changes panel        | sandbox | `koja-changes`, `src/kit/fileStatus.ts`, the panel memory in `koja-tabs`               |
| [Gallery and scenes](qa/features/gallery-and-scenes.md)       | Gallery and scenes   | sandbox | `koja-gallery`, `koja-mocks`, `scripts/capture.ts`                                     |

## Before a launch

For the manager. The `qa` worker starts nothing.

The manager launches the `sandbox` target with Tau's `verification` tool. That runs
`bun run sandbox up`, then `bun run sandbox identity`, and `bun run sandbox down` after the worker
reports. The sandbox name is `koja-<run>`, from the brief's `Verification run:` line.

The manager creates the fixtures after the launch, under `/var/tmp/ruta-<name>/home/`:

- An empty `.zshrc`.
- A Git repository with one commit and uncommitted changes.
- A clean Git repository.
- A folder that is not a repository.

Set `user.name` and `user.email` in each repository. Open a space on each with
`RUTA_NAME=<name> bun run sandbox do space.new --folder <path>`, with two tabs and a split in one.

For either journey, use this fixture instead of the general fixtures above. Start a fresh sandbox
first. Replace `<name>` with its name, then run these commands from the worktree:

```sh
export RUTA_NAME=<name>
fixtureHome=/var/tmp/ruta-$RUTA_NAME/home
mkdir -p "$fixtureHome/pr-fixture"
touch "$fixtureHome/.zshrc"
git -C "$fixtureHome/pr-fixture" init -b fixture-branch
git -C "$fixtureHome/pr-fixture" config user.name 'QA Fixture'
git -C "$fixtureHome/pr-fixture" config user.email qa@example.invalid
git -C "$fixtureHome/pr-fixture" remote add origin https://example.invalid/qa/pr-fixture.git
cat > "$fixtureHome/fake-gh" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$HOME/gh-calls"
if [ -f "$HOME/pr-read-ok" ]; then
  printf '[]\n'
  exit 0
fi
printf 'fixture read failed\n' >&2
exit 1
SH
chmod +x "$fixtureHome/fake-gh"
ln -s "$fixtureHome/fake-gh" "/var/tmp/ruta-$RUTA_NAME/bin/gh"
bun run sandbox do space.new --folder "$fixtureHome/pr-fixture"
bun run sandbox do space.new --folder "$fixtureHome/pr-fixture"
bun run sandbox identity
```

- Start: the commands above create two spaces on an empty fixture repository. No commit is needed.
  The sandbox puts its `bin` first on `PATH`; the fake `gh` never calls GitHub or the real `gh`.
- Check that it is up: identity exits 0. Wait for `Could not read PRs` and `Retry` under
  `pr-fixture`. The `pr-fixture` header shows no agent mark, and its one row shows a hollow one.
  `$fixtureHome/gh-calls` records `pr list`.

The manager stops the run with the `verification` tool after the worker reports.

Give the worker `Data writes: allowed`, the fixture home, and permission to create only
`<fixture home>/pr-read-ok` during recovery. Run recovery before triage when assigning both. The
worker needs no install, restart, repository setup, or real GitHub login.

Ask the user:

- Nothing. No step reads a secret, costs money, or touches shared state.

Give the brief these lines: `Sandbox: <name>`, the fixture paths, and `Data writes: allowed` or
`not allowed`. Give one sandbox to one worker at a time.

## Rules for every section

- From the worktree, run `RUTA_NAME=<name> bun run sandbox guide`, or `RUTA_NAME=<name> ruta guide`.
  Follow two parts of its output: "Every session" and "A session that did not start the sandbox".
  The rules below add to them.
- Run each ruta command of that guide as `bun run sandbox <command>`, except `status`.
  `bun run sandbox` alone prints the arguments of each command.
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
- Use `bun run sandbox do` or `bun run sandbox hc` only when a recipe or the brief names the exact
  command. They skip the keys and clicks a user has.
- The sandbox is not a file system jail. Work only in the fixture paths of the brief. Never do any
  of these:
  - Open a space or a terminal on a real checkout.
  - Create or remove a worktree outside the fixtures.
  - Launch an agent, or connect a machine.
  - Type a shell command that the brief does not list.
- A data write is a commit, a worktree action, a rename, or a close. Follow the brief's
  `Data writes` line. No recipe grants a data write. Palette Recent and picker history are not data
  writes.
- Never run `Quit Herdr`, `Close window`, `Reset to the default screen`, `Duplicate mod`, or
  `Duplicate layout`. They end the sandbox or change its installed files.
- Never run `herdr-app` or `hc` outside `bun run sandbox`.

## Normal mode keys

Target: sandbox

### Reach it

Run `RUTA_NAME=<name> bun run sandbox identity` from the worktree. It prints
`sandbox <name> has the current mods and config of <worktree path>`, and it must exit 0. On any
other result, stop and ask the parent.

### Features

- [Normal mode keys](qa/features/normal-keys.md): every key group, the bracket keys, the sidebar
  mark, and the overlays.

## Close and rename

Target: sandbox

### Reach it

Same as [Normal mode keys](#normal-mode-keys).

### Features

- [Close and rename](qa/features/close-and-rename.md): the close dialogs and the rename prompt.

## Palette and picker

Target: sandbox

### Reach it

Same as [Normal mode keys](#normal-mode-keys).

### Features

- [Command palette](qa/features/palette.md): all entry points, list movement, and Recent.
- [Picker](qa/features/picker.md): the query, the filter, and the preview.

## Sidebar, tabs, panes

Target: sandbox

### Reach it

Same as [Normal mode keys](#normal-mode-keys).

### Features

- [Sidebar, tabs, and panes](qa/features/sidebar-tabs-panes.md): selection, order, headers, and
  menus.

## Changes panel

Target: sandbox

### Reach it

Same as [Normal mode keys](#normal-mode-keys).

### Use it safely

- Commit stages every change of the focused pane's repository. Never type in the message field or
  press the Commit button outside a fixture repository.

### Features

- [Changes panel](qa/features/changes-panel.md): the panel states, the diff, and Commit.

## Gallery and scenes

Target: sandbox

### Reach it

Same as [Normal mode keys](#normal-mode-keys).

### Features

- [Gallery and scenes](qa/features/gallery-and-scenes.md): the gallery, the scene picker, and
  capture.

## Not testable

- The `ö` and `ä` keys of normal mode: the sandbox keyboard cannot type them.
- A double click, such as the rename of a tab: the sandbox input sends single clicks only.
- A pane close that also ends other panes: no fixture step makes a terminal with a live child
  terminal in another pane.
- Agent launch, live agent status, and machines: they need real agents and SSH. The journey fixture
  shows only idle spaces, with no mark on the header and a hollow one on the row, not live status
  changes.
- Live GitHub PR data: the journey fixture tests a failed read and an empty successful read only. It
  does not test authenticated GitHub reads or populated PR data.
- `sandbox up`, `restart`, `install`, and `down`, the build, and the installer: the `qa` worker may
  not run them.
- The look of a scene: the `judge-mock` skill decides it. Two AI judges pass or fail the scene.
