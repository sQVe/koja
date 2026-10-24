# Development

Set up a checkout and check changes before release.

## Local setup

Use the Bun version specified by `packageManager` in [package.json](../package.json). Bun is the
runtime, package manager, and test runner. Run these commands from the Koja checkout:

```sh
bun install --frozen-lockfile
bun run build:vt
bun run check
```

`bun run build:vt` builds `build/libkoja-vt.so` on Linux x86_64. It downloads Zig and the pinned
Ghostty source to `${XDG_CACHE_HOME:-$HOME/.cache}/koja` and applies the patches in `patches/`. Run
it again after you change `src/vt/shim.c` or a patch. Each patch set builds in its own cached
Ghostty tree, and `build/ghostty` links to the tree in use.

Run Koja locally with one command:

```sh
bun run start
```

`bun run start` builds `build/libkoja-vt.so` when it is missing, then runs the server in the
foreground on `/tmp/koja-dev/koja.sock`. Point other commands at it with
`--socket /tmp/koja-dev/koja.sock`, for example
`bun src/index.ts server stop --socket /tmp/koja-dev/koja.sock`. It builds only a missing library,
so run `bun run build:vt` yourself after a change to `src/vt/shim.c` or a patch.

`bun install` also installs the Git hooks. The pre-commit hook runs the house-style and format
checks on staged files.

## Check changes

| Command                           | Use                                                                       |
| --------------------------------- | ------------------------------------------------------------------------- |
| `bun run check`                   | Run typechecking, house style, formatting, Knip, and the full test suite. |
| `bun run test`                    | Run the full test suite.                                                  |
| `bun run test tests/lint.test.ts` | Run one test file.                                                        |
| `bun run test:changed`            | Run tests affected by uncommitted changes.                                |
| `bun run style:check`             | Check all lint rules, including house style, with `seam`.                 |
| `bun run style:fix`               | Apply safe lint fixes with `seam --fix`, then format.                     |
| `bun run lint`                    | Run ordinary lint diagnostics, as editors do.                             |
| `bun run format`                  | Format files.                                                             |
| `bun run knip`                    | Find unused files, exports, and dependencies.                             |

House style comes from the [`@sqve/seam`](https://www.npmjs.com/package/@sqve/seam) package. Its
`seam` command turns on the house rules for its own lint run, so editors and `bun run lint` show the
ordinary rules only. Koja adds local rules from [scripts/lintRules.ts](../scripts/lintRules.ts).
They run in every lint command.

Style commands accept file paths, for example `bun run style:fix tests/lint.test.ts`. Rename
bindings and move helpers manually.

Configure linting, formatting, and staged checks in [vite.config.ts](../vite.config.ts). Run
installed command-line tools with `bunx --bun`, as the scripts do. The tools start with a Node
shebang, so without `--bun` they run on Node instead of Bun.

## Mutation testing

The mutation gate runs StrykerJS on the lines a change touches. It reports a mutant that no test
detects, and a changed line that no test reaches. Build the VT library first, then run:

```sh
bun run build:vt
bun run mutation changed origin/main
bun run mutation audit src/layout.ts
```

- `changed <base>` mutates the lines that `git diff -U0 <base>` adds, and every line of an untracked
  file. It exits 2 when a mutant survives or has no coverage.
- `audit <path>...` mutates whole files and exits 0 on survivors.
- Every mutant runs by default. `--max-mutants <n>` sets a cap for a local run. A file that does not
  fit is listed in `unmutated`, and the run exits 1.
- The command prints one JSON report on stdout. Stryker's own output goes to stderr. Each survivor
  has `file`, `line`, `column`, `endLine`, `endColumn`, `mutator`, `original`, `replacement`, and
  `covered`. `covered: false` means no test reaches the line.

The gate runs the `mutation` command of the
[`@sqve/mutation`](https://www.npmjs.com/package/@sqve/mutation) package, a pinned dev dependency,
on Bun. Its README lists the report fields and the exit codes. `bun run mutation` and
`mutation.argv` in [.pi/tau.json](../.pi/tau.json) both pass `--same-folder-tests`.

The gate mutates production files under `src/` and starts Stryker once per folder. It runs only the
unit tests directly in that folder, never those of another folder or `tests/`. A file in a folder
with no unit test reports no coverage. See
[ADR 0017](./adr/0017-mutation-gate-runs-same-folder-unit-tests.md) for the reasons and the four
modules it leaves out.

The package always adds its `tauMessageIgnorer` ignorer, which skips the text of messages, and sets
`ignoreStatic: true`. Koja's [stryker.config.json](../stryker.config.json) sets the rest: the
`mutate` globs, the left-out modules, the timeouts, and the Bun runner. Bump the pinned package
version to get a fix.

The pull request job `Mutation` in [ci.yml](../.github/workflows/ci.yml) runs `mutation.argv`
against the merge base, with no cap. It is advisory: it lists survivors on the pull request, it is
not a required check, and `timeout-minutes` bounds its time.
[scripts/mutation-tuning.md](../scripts/mutation-tuning.md) records how the config was tuned.

## Versioning

Add a changeset when a PR changes `src/**`, including internal changes:

```sh
bun run changeset
```

Describe the change for users. Commit the generated file under `.changeset/` with the change it
describes.

The [changeset check](../.github/workflows/changeset.yml) applies to PRs targeting `main` that
change `src/**`. It skips PRs titled `chore: release version packages` or whose head branch is
`changeset-release/main`. Changes outside `src/**` alone do not trigger this gate.

The [release workflow](../.github/workflows/release.yml) opens version PRs and creates Git tags and
GitHub releases. Koja is public on GitHub and is not published to npm.
