# Development

Set up a checkout and check changes before release.

## Local setup

Use the Bun version specified by `packageManager` in [package.json](../package.json). Bun is the
runtime, package manager, test runner, and bundler. Install [mise](https://mise.jdx.dev), which
installs the pinned stomme release. Run these commands from the Koja checkout:

```sh
mise trust
mise install
bun install --frozen-lockfile
bun run check
```

`bun install` also installs the Git hooks. The pre-commit hook runs the house-style and format
checks on staged files.

## Build

```sh
bun run build
```

`bun run build` bundles each mod in `src/mods/<name>/` into `dist/mods/<name>/main.js` and copies
the mod's other files and the kit's icons beside it.

## Install into Herdr

```sh
bun run herdr:install
```

`bun run herdr:install` builds the mods, copies them and the files in `config/` into
`~/.config/herdr-app`, and runs `herdr-app check` on every installed mod. Set `HERDR_APP_HOME` to
install into another Herdr home, and `HERDR_APP_BIN` to check the mods with another herdr-app
binary. Run `bun run herdr:watch` to build and install again on every save in `src/` or `config/`.

An interrupted install can leave `.koja-install.lock` in the Herdr home. Stop the watch and every
other install for that home, check that no installer still runs, then remove only that lock file and
retry. The installer never removes a regular lock sentinel it did not create, and it reports this
recovery when the lock waits too long.

Then switch Herdr to Koja's layout. This is the one-time real install step, not QA; try mods in the
sandbox below instead:

```sh
herdr-app do layout.switch --name koja
```

## Sandbox

Try and QA mods in a throwaway Herdr window with its own core, home, and private headless display.
[ruta](https://github.com/sQVe/ruta) runs the display, the window, the input, and the shots, with
the settings in [ruta.toml](../ruta.toml). Install it once:

```sh
cargo install --git https://github.com/sQVe/ruta --tag v0.2.2 --locked ruta
```

`up` installs this checkout with the existing installer, so it shows the worktree's mods and
`config/`. `restart` reinstalls and starts the window and its core again. `.pi/tau.json` declares
the same commands as the `sandbox` verification target, so Tau's `verification` tool launches,
checks, and stops the sandbox. See [ADR 0017](adr/0017-sandbox-is-a-verification-target.md).

```sh
bun run sandbox up
bun run sandbox shot
bun run sandbox click 941 137
bun run sandbox scroll 640 400 5
bun run sandbox type "pane"
bun run sandbox key p Control_L Shift_L
bun run sandbox install
bun run mock:capture <scene>
bun run sandbox down
```

`shot` writes the window at its own pixel size, so a coordinate read from a shot matches `click`.
`scroll x y n` turns the wheel n notches over that point, down for a positive n and up for a
negative one; dragging a scrollbar does not scroll a Herdr view. `bun run sandbox install`
reinstalls after a mod edit without restarting the sandbox. `bun run sandbox identity` runs
`ruta status` first, which passes only when the sandbox is up and was started from this checkout. It
then exits 0 only when the sandbox has this checkout's current mods and `config/`, compared by
content hash, and prints each reason when it does not. It changes no file and starts nothing.
`bun run sandbox do <action>`, `status`, and `hc <args>` drive the sandbox window and core, so
`status` is `herdr-app status`, not `ruta status`. Every other command goes to ruta, so `guide`,
`log`, `opened`, `drag`, `hold`, and `release` work as `ruta` describes them.
`bun run sandbox guide` prints ruta's rules for a session that starts a sandbox and for one that
only drives it. A sandbox name belongs to the checkout that installed it: every command that would
start, change, or remove a sandbox refuses when another checkout holds the name, and names that
checkout. A checkout that no longer exists holds nothing, so its sandbox can still be inspected and
removed. `RUTA_NAME=<name>` runs a second sandbox side by side, and `TAU_VERIFICATION_RUN` names it
`koja-<run>` for a Tau verification run. `HERDR_APP_BIN` runs another herdr-app binary instead of
the installed one.

Never use `ydotool`, and never run `herdr-app do`, `hc`, or synthetic input against the user's real
window or core.

## Check changes

| Command                                | Use                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `bun run check`                        | Run typechecking, house style, stomme check, formatting, Knip, and the full test suite. |
| `bun run test`                         | Run the full test suite.                                                                |
| `bun run test:changed`                 | Run tests affected by uncommitted changes.                                              |
| `bun run style:check`                  | Check all lint rules, including house style, with `stomme-ts-style`.                    |
| `bun run stomme:check`                 | Check the shared stomme rules.                                                          |
| `bun run style:fix`                    | Apply safe house-style fixes with `stomme-ts-style --fix`.                              |
| `bun run lint`                         | Run ordinary lint diagnostics, as editors do.                                           |
| `bun run format`                       | Format files.                                                                           |
| `bun run knip`                         | Find unused files, exports, and dependencies.                                           |
| `bun run mutation changed origin/main` | List the mutants in changed lines that no test kills.                                   |

After a change to the stomme pin or layers in `stomme.toml` or `mise.toml`, run
`mise exec -- stomme sync` and commit what it writes.

House style comes from the
[`@sqve/stomme-ts-style`](https://www.npmjs.com/package/@sqve/stomme-ts-style) package. Its
`stomme-ts-style` command turns on the house rules for its own lint run, so editors and
`bun run lint` show the ordinary rules only.

Configure linting, formatting, and staged checks in [vite.config.ts](../vite.config.ts). Run
installed command-line tools with `bunx --bun`, as the scripts do. The tools start with a Node
shebang, so without `--bun` they run on Node instead of Bun.

## Versioning

Add a changeset when a change touches `src/**`:

```sh
bun run changeset
```

Describe the behavior change for users. Commit the generated file under `.changeset/` with the
change it describes.

The [changeset check](../.github/workflows/changeset.yml) requires a changeset when a PR touches
`src/**`. It skips the check when the PR title is `chore: release version packages` or the head
branch is `changeset-release/main`, which covers the release workflow's version PR. Changes only to
docs, tooling, or dependencies do not need one.

The [release workflow](../.github/workflows/release.yml) opens version PRs and creates Git tags and
GitHub releases. Koja is private and is not published to npm.
