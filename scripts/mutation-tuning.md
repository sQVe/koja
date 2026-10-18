# Mutation tuning note

This note records how `stryker.config.json` was tuned for Phi. It lists the sample commits, the
survivors of each commit, and the reason for each setting. Usage is in
[the development guide](../docs/development.md#mutation-testing).

## Method

For each commit, a detached worktree held the commit. The mutation scripts, `stryker.config.json`,
and `bunfig.mutation.toml` were copied in, `build/libphi-vt.so` was built there, and `node_modules`
was a symlink to the main checkout. Each run was
`bun scripts/mutation.ts changed <sha>~1 --max-mutants 5000`. The cap is raised because the default
500 leaves files unmutated on large commits, and an unmutated file ends the run with exit 1. The
worktrees are removed.

Kinds, in the table columns:

- Gap, no unit test: a survivor in a file with no unit test next to it at that commit. Behavior may
  still be tested from `tests/`, which the gate does not run.
- Gap, weak test: a survivor in a file with a unit test, where no listed rule says the change is
  unobservable.
- Equivalent: the survivor sits on a line that the ME-707 pilot sorted as equivalent or defensive.
  The pilot ran at `e4401f8`. For other commits the pilot line is mapped to the commit with
  `git diff -U0`, and a changed or removed line is not mapped. A non-`StringLiteral` survivor on a
  mapped line counts as equivalent.
- Noise: a `StringLiteral` survivor whose text is a sentence, such as a CLI error message returned
  as a plain string. The wording ignorer cannot skip it, because it is not an argument of `Error`,
  an `invariant` message, or the `error` of a failed result.

The sorting is by rule, not by reading each survivor. "Survivors" counts `Survived` and `NoCoverage`
mutants. The gap columns are the places a new test would help. They are not all untested behavior: a
file with no unit test often has tests under `tests/`.

## Sample commits

The commits are production commits on `main` that changed `src/` with new code. The test-gap commits
ME-701 to ME-705 only add tests and are not sampled. `5d99475` changed `src/layout.ts`. `e4401f8` is
the pilot commit.

| Commit  | Subject                                                         | Mutants | Killed | Survived | No coverage | Timeout | Gap, no unit test | Gap, weak test | Equivalent | Noise |
| ------- | --------------------------------------------------------------- | ------- | ------ | -------- | ----------- | ------- | ----------------- | -------------- | ---------- | ----- |
| 5d99475 | feat: forward the mouse to panes and click to focus (#59)       | 535     | 481    | 44       | 10          | 0       | 0                 | 40             | 14         | 0     |
| f7a9779 | feat: forward pane bells and clipboard writes from panes (#60)  | 106     | 24     | 7        | 72          | 3       | 72                | 7              | 0          | 0     |
| e4401f8 | feat: scroll pane history in Phi mode (#61)                     | 1664    | 1075   | 240      | 313         | 36      | 248               | 195            | 95         | 15    |
| cf2c278 | feat: draw the remaining cell styles and the cursor shape (#63) | 81      | 56     | 23       | 2           | 0       | 0                 | 25             | 0          | 0     |
| acbfad2 | feat: copy any range of pane history (#62)                      | 414     | 161    | 29       | 222         | 2       | 226               | 10             | 0          | 15    |
| 119eae8 | feat: move panes between tabs and workspaces (#58)              | 445     | 230    | 59       | 156         | 0       | 153               | 48             | 4          | 10    |
| fa6fa3d | feat: print JSON by default where herdr does (#57)              | 113     | 78     | 8        | 27          | 0       | 23                | 10             | 0          | 2     |

## Runs

The load average is the 1, 5, and 15 minute value from `/proc/loadavg` before the run. Every run
ended with exit code 2, which means survivors in changed mode.

| Commit  | Load average before | Seconds |
| ------- | ------------------- | ------- |
| 5d99475 | 4.01, 6.69, 5.82    | 14      |
| f7a9779 | 4.81, 6.74, 5.85    | 5       |
| e4401f8 | 5.06, 6.76, 5.86    | 66      |
| cf2c278 | 8.26, 7.34, 6.13    | 5       |
| acbfad2 | 8.24, 7.35, 6.14    | 6       |
| 119eae8 | 7.58, 7.24, 6.11    | 7       |
| fa6fa3d | 7.54, 7.24, 6.12    | 4       |

Two earlier attempts at `5d99475` ended at the dry run and led to two settings below. The first
failed in `src/server/rowPublisher.test.ts`, which waits on real time. The second failed because the
`build/libphi-vt.so` of the current checkout did not match the old `src/vt/` code, so each worktree
builds its own.

## What the survivors show

- `e4401f8` has 553 survivors. The 248 in files with no unit test are mostly in
  `src/client/clientAttach.ts` (78), `src/server/clientRequests.ts` (69), and
  `src/cli/paneScrollCommand.ts` (55). The 195 weak-test survivors are mostly in
  `src/ui/scrollMode.ts` (72), `src/client/rowFetch.ts` (21), `src/client/snapshot.ts` (20), and
  `src/ui/paneLayer.ts` (20). The 95 equivalent survivors are in `src/ui/scrollMode.ts` (51),
  `src/ui/paneRenderable.ts` (24), and `src/ui/scrollMotions.ts` (18). The 15 noise survivors are
  message text in the scroll CLI files.
- `5d99475` has no file without a unit test. Its 40 weak-test survivors are in `src/ui/input.ts`
  (22), `src/ui/screenTargets.ts` (14), and `src/ui/mouseEncoding.ts` (4).
- `cf2c278` has 25 weak-test survivors in `src/ui/paneLayer.ts`, `src/ui/paneRenderable.ts`, and one
  in `src/rows/rows.ts`. They are the focus flag, the cursor position, and the focus redraw.
- `acbfad2`, `119eae8`, and `fa6fa3d` are mostly no coverage (222, 156, and 27 mutants). The CLI and
  server request code they changed has tests only under `tests/`. The gate reports it, as decided in
  ADR 0017.
- ME-701 to ME-705 added tests after these commits. This note does not recount which survivors they
  killed.

## Settings

| Setting                                                 | Reason                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testRunner: "bun"` with `@hughescr/stryker-bun-runner` | The `command` runner has no coverage data, so it reports every mutant in an untested file as survived. The Bun runner records per-test coverage from `bun test`.                                                                                                                                                    |
| `coverageAnalysis: "perTest"`                           | A mutant runs only the tests that reach it, and a line no test reaches is `NoCoverage`. Without it a run takes the whole suite per mutant.                                                                                                                                                                          |
| `bun.testFiles: ["src"]`                                | Runs only the test files under `src/`, which are the unit tests next to each file. It leaves out `tests/` (ADR 0017).                                                                                                                                                                                               |
| `bun.bunArgs: ["--config=bunfig.mutation.toml"]`        | The mutation bunfig adds `pathIgnorePatterns` for the tests of the four left-out modules. `bun test` still reads `bunfig.toml` and runs them. The runner keeps `pathIgnorePatterns` from the bunfig it reads.                                                                                                       |
| `bun.env: { PHI_MUTATION: "1" }`                        | `src/ui/inputTokens.test.ts` skips the large paste timing test when this is set. The test takes 1 s per mutant. `bun test` does not set it, so the test still runs there. `-t` filters are rejected by the runner.                                                                                                  |
| `bun.timeout: 120000`                                   | Bounds only the dry run. The dry run of `src/` takes about 2 s. The runner warns above 80% of this value, so there is room under load.                                                                                                                                                                              |
| `mutate`                                                | `src/**/*.ts` without tests, minus `src/server/processInfo.ts`, `src/server/socketPath.ts`, `src/server/rowPublisher.ts`, and `src/client/clipboardWrite.ts`. Their tests start processes, open sockets, or wait on real time, so they are slow and fail under load. `.tsx` files are not mutated.                  |
| `tsconfigFile: "stryker-no-tsconfig.json"`              | Stryker reads `tsconfig.json` with the `typescript` package, and TypeScript 7 has no `parseConfigFileTextToJson`, so a run stops with `ts.parseConfigFileTextToJson is not a function`. Naming a file that does not exist skips the read. The file is not created. Phi has no checker, so nothing needs the config. |
| `checkers: []`                                          | No type checker. A checker needs the `typescript` package, which TypeScript 7 breaks for Stryker (see the `tsconfigFile` row).                                                                                                                                                                                      |
| `ignoreStatic: true`                                    | A static mutant lives in module-level code, which runs once at load. Stryker would run the whole suite for each of them. With the setting it ignores them, so the run is faster and the cap counts them anyway.                                                                                                     |
| `plugins` and `ignorers`                                | Load the bun runner and `scripts/mutationIgnorer.ts`, and turn on `phiMessageIgnorer`. It skips the text of error messages, `invariant` messages, and the `error` of a failed result. That wording is not behavior.                                                                                                 |
| `timeoutMS: 2000`                                       | The pilot's loop mutants in `rowCache.ts` waited 10 s each. With this value `src/client/rowCache.ts` ends in 12 s with 10 timeouts. The runner kills a hung `bun test` shortly before the timeout.                                                                                                                  |
| `concurrency: 4`                                        | Four workers. Runs take seconds to about a minute at this value, so it was not tuned further.                                                                                                                                                                                                                       |
| `ignorePatterns`                                        | Leaves `.tau`, `docs`, `dist`, `coverage`, and `CHANGELOG.md` out of the sandbox. `build/` stays in, because the VT tests load `build/libphi-vt.so` from it. Run `bun run build:vt` first.                                                                                                                          |
| `tempDirName: ".stryker-tmp"`, `cleanTempDir`           | Keeps the sandbox inside the checkout. The folder is in `.gitignore`.                                                                                                                                                                                                                                               |
| `fileLogLevel: "off"`                                   | Stryker writes `stryker.log` to the working directory otherwise. Its output goes to stderr.                                                                                                                                                                                                                         |

## Differences from the Tau script

- Tau's `falseSurvivors` logic is removed. It handled a static mutant that makes a test file throw
  while loading, which Vitest reports as survived. The Bun runner scores a mutant that stops a test
  file from loading as a kill, so the case does not arise. The report has no `falseSurvivors` field
  and no `falseSurvived` total.
- Each survivor carries `endLine` and `endColumn`. Several mutants can start at the same line and
  column, and only the full range tells them apart.
- The script starts Stryker with the runtime that runs the script, so `bun scripts/mutation.ts`
  needs no Node install.
- The ignorer is named `phiMessageIgnorer`.

## TypeScript 7 and the runner peer dependency

`@hughescr/stryker-bun-runner` declares the peer dependency `typescript <7`, and Phi uses TypeScript
7.0.2. `bun add` prints `warn: incorrect peer dependency "typescript@7.0.2"`. Bun does not fail on
it, and `bun install --frozen-lockfile` is silent and exits 0. Phi keeps TypeScript 7. The runner
reads `typescript` only through Stryker's tsconfig step, which the `tsconfigFile` setting skips. npm
would refuse this install with `ERESOLVE`, but Phi installs with Bun only.

## Open points

- 157 of the 315 survivors left after an audit of all of `src/` are `StringLiteral` mutants, mostly
  the plain-string error messages of the CLI parsers (`paneCommandParse.ts` has 34). The copied
  ignorer does not skip them. They report as noise in a changed-mode run on those lines.
- The audit of all of `src/` leaves 158 survivors that are not message text. They are real gaps, and
  ME-701 to ME-705 are out of scope here. The largest groups are `vt/vt.ts`,
  `server/sessionFile.ts`, `server/connection.ts`, `store/paneTransitions.ts`, and
  `store/clientTransitions.ts` (the `activity > latestActivity` condition changed to `true`).
- A comment `// Stryker disable next-line` works only as a leading comment of a node on the target
  line. Before `} catch {` and before the closing `)` of a call the instrumenter does not attach it,
  so the three such lines use a block comment in front of the token.
