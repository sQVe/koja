# QA guide

Koja ships Herdr desktop mods: one window with a spaces sidebar, a tab strip, pane headers, a
Changes panel, and keyboard overlays. QA drives that window in a private sandbox, never in the
user's real Herdr window.

## Choose sections

| Section              | Test it when the change touches                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Normal mode keys     | `koja-modal`, `src/kit/normalKeys.ts`, `config/keys.json`                                            |
| Close and rename     | `src/kit/askFirst.ts`, `askPlan.ts`, `dialog*.ts`, `koja-confirm`, `koja-prompt`                     |
| Palette and picker   | `koja-palette`, `koja-picker`, `koja-help`, `src/kit/palette.ts`, `src/kit/overlay/`, `shortcut*.ts` |
| Sidebar, tabs, panes | `koja-spaces`, `koja-tabs`, `koja-pane`, `koja-menu`, `koja-new-menu`, `koja-worktree`               |
| Changes panel        | `koja-changes`, `src/kit/fileStatus.ts`, the panel memory in `koja-tabs`                             |
| Gallery and scenes   | `koja-gallery`, `koja-mocks`, `scripts/capture.ts`                                                   |

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

| Journey                                                                                             | Goal                                                                       | Run it when the change touches                                                                                                                                                                                                                    | Test    |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [Triage the spaces that need you](qa/journeys/triage-the-spaces-that-need-you.md)                   | Read the space rows, switch to Inbox, and choose the space that needs you. | `src/mods/koja-spaces/`, `src/mods/koja-spaces/inbox*.ts`, `src/kit/viewSwitch.ts`, `src/kit/space.ts`, `src/kit/statusMark.ts`, `src/kit/spaceOrder.ts`                                                                                          | by hand |
| [Recover from a failed PR read](qa/journeys/recover-from-a-failed-pr-read.md)                       | Retry a failed read without losing the space rows.                         | `src/mods/koja-spaces/`, `src/kit/stateLine.ts`, `src/kit/button.ts`, `src/data/pull*.ts`                                                                                                                                                         | by hand |
| [Find the space that holds a pull request](qa/journeys/find-the-space-that-holds-a-pull-request.md) | Find a space by a PR number in its stack, then switch to it.               | `koja-picker`, `src/data/spaceStack.ts`, `src/data/stacks.ts`                                                                                                                                                                                     | by hand |
| [Check how far a stack has come](qa/journeys/check-how-far-a-stack-has-come.md)                     | Read what a stack's PRs need from its sidebar row.                         | `src/mods/koja-spaces/`, `src/mods/koja-spaces/selectedFooter.ts`, `src/kit/spaceFooter.ts`, `src/kit/stackProgress.ts`, `src/kit/hoverCard.ts`, `src/kit/stackCard.ts`, `src/kit/workIcon.ts`, `src/data/pullNeeds.ts`, `src/data/spaceStack.ts` | by hand |

## Features

| Feature                                                       | Section              | Target  | Update it when the change touches                                                                           |
| ------------------------------------------------------------- | -------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| [Normal mode keys](qa/features/normal-keys.md)                | Normal mode keys     | sandbox | `koja-modal`, `src/kit/normalKeys.ts`, `config/keys.json`                                                   |
| [Close and rename](qa/features/close-and-rename.md)           | Close and rename     | sandbox | `src/kit/askFirst.ts`, `askPlan.ts`, `dialog*.ts`, `koja-confirm`, `koja-prompt`                            |
| [Command palette](qa/features/palette.md)                     | Palette and picker   | sandbox | `koja-palette`, `koja-help`, `src/kit/palette.ts`, `src/kit/overlay/`, `shortcut*.ts`                       |
| [Picker](qa/features/picker.md)                               | Palette and picker   | sandbox | `koja-picker`, `src/kit/palette.ts`, `src/kit/overlay/`                                                     |
| [Sidebar, tabs, and panes](qa/features/sidebar-tabs-panes.md) | Sidebar, tabs, panes | sandbox | `koja-spaces`, `koja-tabs`, `koja-pane`, `koja-menu`, `koja-new-menu`, `koja-worktree`, `src/data/pull*.ts` |
| [Changes panel](qa/features/changes-panel.md)                 | Changes panel        | sandbox | `koja-changes`, `src/kit/fileStatus.ts`, the panel memory in `koja-tabs`                                    |
| [Gallery and scenes](qa/features/gallery-and-scenes.md)       | Gallery and scenes   | sandbox | `koja-gallery`, `koja-mocks`, `scripts/capture.ts`                                                          |

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

For [Triage the spaces that need you](qa/journeys/triage-the-spaces-that-need-you.md) and
[Recover from a failed PR read](qa/journeys/recover-from-a-failed-pr-read.md), use this fixture
instead of the general fixtures above. Start a fresh sandbox first. Replace `<name>` with its name,
then run these commands from the worktree:

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
  printf '%s\n' '{"data":{"rateLimit":{"cost":1,"remaining":4999,"resetAt":"2030-01-01T00:00:00Z"},"repository":{"open0":{"nodes":[]},"latest0":{"nodes":[]}}}}'
  exit 0
fi
printf 'fixture read failed\n' >&2
exit 1
SH
chmod +x "$fixtureHome/fake-gh"
ln -s "$fixtureHome/fake-gh" "/var/tmp/ruta-$RUTA_NAME/bin/gh"
bun run sandbox do space.new --folder "$fixtureHome/pr-fixture"
terminal=$(bun run sandbox do space.new --folder "$fixtureHome/pr-fixture" | jq -er .terminal)
bun run sandbox hc send "$terminal" "exec sh -c 'printf %b \"\$1\"; exec sleep 86400' qa '\033]7501;state=blocked:app=pi:kind=question\033\\\\'"
bun run sandbox identity
```

- Start: the commands above create two spaces on an empty fixture repository. No commit is needed.
  The sandbox puts its `bin` first on `PATH`; the fake `gh` never calls GitHub or the real `gh`.
- Check that it is up: identity exits 0. Wait for `Could not read PRs` and `Retry` under
  `pr-fixture`. The `pr-fixture` header shows no agent mark, and its one row, the second space,
  shows the red blocked mark. `$fixtureHome/gh-calls` records `api graphql`.

The manager stops the run with the `verification` tool after the worker reports.

Give the worker `Data writes: allowed`, the fixture home, and permission to create only
`<fixture home>/pr-read-ok` during recovery. Run recovery before triage when assigning both. The
worker needs no install, restart, repository setup, or real GitHub login.

Ask the user:

- Nothing. No step reads a secret, costs money, or touches shared state.

Give the brief these lines: `Sandbox: <name>`, the fixture paths, and `Data writes: allowed` or
`not allowed`. Give one sandbox to one worker at a time.

### Second machine

A space on another machine needs the fixture machine. Only the manager starts and connects it. The
`qa` worker never does.

From the worktree, with the sandbox up:

```sh
export RUTA_NAME=<name>
scripts/sandbox-machine up
bun run sandbox do space.new "{\"folder\":\"/var/tmp/ruta-$RUTA_NAME/machine/home/remote-fixture\",\"machine\":\"qa-remote\"}"
bun run sandbox hc exec --on qa-remote sh -c 'echo $HOME $XDG_RUNTIME_DIR'
```

- Start: `scripts/sandbox-machine up` starts an sshd on loopback and adds the machine `qa-remote` to
  the sandbox core. It needs `bun run sandbox identity` to exit 0 first, and it prints the machine
  name and the path of its fixture repository. The machine's keys, home, runtime folder, and
  herdr-core all sit under `/var/tmp/ruta-<name>/machine/`. The server runs in a transient systemd
  user service, so the user manager and cgroup filesystem are also used. `up` checks cgroup v2 and
  the user manager with a disposable service before starting sshd; if that check fails, it starts no
  listener. No root is needed.
- Check that it is up: the `hc exec` command prints two paths under `/var/tmp/ruta-<name>/machine/`,
  and the space shows a `remote-fixture` project header with the `qa-remote` label.
- Stop: `bun run sandbox down` runs `scripts/sandbox-machine down` first. That forgets the machine,
  stops the recorded transient service and drains its cgroup, then deletes
  `/var/tmp/ruta-<name>/machine/`.

### PR rows fixture

An unnamed space row shows the PR title of its branch. This fixture gives one local space and one
remote space a title, so a sidebar shot shows the rows before and after a sidebar change.

Start a fresh sandbox first. Replace `<name>` with its name, then run these commands from the
worktree:

```sh
export RUTA_NAME=<name>
fixtureHome=/var/tmp/ruta-$RUTA_NAME/home
touch "$fixtureHome/.zshrc"
mkdir -p "$fixtureHome/pr-rows"
git -C "$fixtureHome/pr-rows" init -b fixture-branch
git -C "$fixtureHome/pr-rows" config user.name 'QA Fixture'
git -C "$fixtureHome/pr-rows" config user.email qa@example.invalid
git -C "$fixtureHome/pr-rows" remote add origin https://example.invalid/qa/pr-rows.git
cat > "$fixtureHome/fake-gh" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$HOME/gh-calls"
printf '%s\n' '{"data":{"rateLimit":{"cost":1,"remaining":4999,"resetAt":"2030-01-01T00:00:00Z"},"repository":{"open0":{"nodes":[{"number":7,"state":"OPEN","isDraft":false,"title":"Fixture pull request","url":"https://example.invalid/qa/pr-rows/pull/7","headRefName":"fixture-branch","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","reviewDecision":null,"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"SUCCESS"}}}]},"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[]}}]},"latest0":{"nodes":[]}}}}'
SH
chmod +x "$fixtureHome/fake-gh"
ln -s "$fixtureHome/fake-gh" "/var/tmp/ruta-$RUTA_NAME/bin/gh"
scripts/sandbox-machine up
cat > "/var/tmp/ruta-$RUTA_NAME/machine/bin/gh" <<'SH'
#!/bin/sh
printf '%s\n' '{"data":{"rateLimit":{"cost":1,"remaining":4999,"resetAt":"2030-01-01T00:00:00Z"},"repository":{"open0":{"nodes":[{"number":8,"state":"OPEN","isDraft":false,"title":"Remote fixture pull request","url":"https://example.invalid/qa/remote-fixture/pull/8","headRefName":"remote-branch","mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","reviewDecision":null,"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"SUCCESS"}}}]},"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[]}}]},"latest0":{"nodes":[]}}}}'
SH
chmod +x "/var/tmp/ruta-$RUTA_NAME/machine/bin/gh"
bun run sandbox hc exec --on qa-remote sh -c 'cd "$HOME/remote-fixture" && git remote add origin https://example.invalid/qa/remote-fixture.git && git checkout remote-branch'
bun run sandbox do space.new --folder "$fixtureHome/pr-rows"
bun run sandbox do space.new --folder "$fixtureHome/pr-rows"
bun run sandbox do space.new "{\"folder\":\"/var/tmp/ruta-$RUTA_NAME/machine/home/remote-fixture\",\"machine\":\"qa-remote\"}"
bun run sandbox do space.new "{\"folder\":\"/var/tmp/ruta-$RUTA_NAME/machine/home/remote-fixture\",\"machine\":\"qa-remote\"}"
bun run sandbox identity
```

- Start: the commands open two spaces on each repository, after both fake `gh` scripts are in place.
  The first space of a project becomes its header, which never shows a PR title; the second is the
  unnamed row that does. The sandbox puts its `bin` first on `PATH`, and `scripts/sandbox-machine`
  puts `/var/tmp/ruta-<name>/machine/bin` first on the machine's `PATH`, so each read runs a fake
  `gh` and no read reaches GitHub. The local fake appends each call to `$fixtureHome/gh-calls`.
- Check that it is up: within 60 s of the spaces opening, the row under the `pr-rows` header reads
  `Fixture pull request`, and the row under the `remote-fixture` header with the `qa-remote` label
  reads `Remote fixture pull request`. No `Could not read PRs` line shows.
- Shot: `bun run sandbox shot <slice directory>/pr-rows-before.png` before the sidebar change, and
  `pr-rows-after.png` in the same directory after it.
- Stop: the `verification` tool, which runs `bun run sandbox down`.

### Ticket title fixture

For the sidebar title from Linear. Start a fresh sandbox first. Replace `<name>` with its name, then
run these commands from the worktree:

```sh
export RUTA_NAME=<name>
fixtureHome=/var/tmp/ruta-$RUTA_NAME/home
touch "$fixtureHome/.zshrc"
mkdir -p "$fixtureHome/ticket-fixture"
git -C "$fixtureHome/ticket-fixture" init -b me-1036-fixture-title
git -C "$fixtureHome/ticket-fixture" config user.name 'QA Fixture'
git -C "$fixtureHome/ticket-fixture" config user.email qa@example.invalid
git -C "$fixtureHome/ticket-fixture" remote add origin https://example.invalid/qa/ticket-fixture.git
printf '%s\n' 'workspace = "sqve"' > "$fixtureHome/ticket-fixture/.linear.toml"
cat > "$fixtureHome/fake-linear" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$HOME/linear-calls"
printf '%s\n' '{"data":{"ticket0":{"identifier":"ME-1036","title":"Fixture ticket title","state":{"name":"In Progress"},"url":"https://linear.app/sqve/issue/ME-1036","parent":null}}}'
SH
chmod +x "$fixtureHome/fake-linear"
ln -s "$fixtureHome/fake-linear" "/var/tmp/ruta-$RUTA_NAME/bin/linear"
cat > "$fixtureHome/fake-gh" <<'SH'
#!/bin/sh
printf '%s\n' '{"data":{"rateLimit":{"cost":1,"remaining":4999,"resetAt":"2030-01-01T00:00:00Z"},"repository":{"open0":{"nodes":[]},"latest0":{"nodes":[]}}}}'
SH
chmod +x "$fixtureHome/fake-gh"
ln -s "$fixtureHome/fake-gh" "/var/tmp/ruta-$RUTA_NAME/bin/gh"
bun run sandbox do space.new --folder "$fixtureHome/ticket-fixture"
bun run sandbox do space.new --folder "$fixtureHome/ticket-fixture"
bun run sandbox identity
```

- Start: the commands open two spaces on a repository whose branch names ticket `ME-1036` and whose
  `.linear.toml` names workspace `sqve`. The fake `linear` answers the ticket query and records each
  call in `$fixtureHome/linear-calls`; the fake `gh` answers an empty pull read, so no read reaches
  GitHub or Linear.
- Check that it is up: within 60 s of the spaces opening, the unnamed row under the `ticket-fixture`
  header reads `Fixture ticket title`, not `ticket-fixture`. A named space keeps its name.
- Shot: `bun run sandbox shot <slice directory>/ticket-title.png`.
- Stop: the `verification` tool, which runs `bun run sandbox down`.

### Stack fixture

See the [stack fixture](qa/fixtures/stack.md) page.

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
- Agent launch and live agent status: they need real agents. The journey fixture shows one idle
  space and one blocked space, whose terminal reports the blocked status and then sleeps. It shows
  no live status changes.
- Real SSH machines, machine login, and a rebuilt machine: they need a real server and credentials.
  The [second machine](#second-machine) fixture tests only the sidebar header of a project on
  `qa-remote`.
- Live GitHub PR data: the journey fixtures test a failed read, an empty successful read, and
  populated PRs from a fake `gh`. They do not test authenticated GitHub reads, or populated PRs that
  come from GitHub itself.
- `sandbox up`, `restart`, `install`, and `down`, the build, and the installer: the `qa` worker may
  not run them.
- The look of a scene: the `judge-mock` skill decides it. Two AI judges pass or fail the scene.
