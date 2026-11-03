# Mutation tuning

This note records why `stryker.config.json` has each setting. Run the commits below again after you
change a setting that changes the mutants or their results.

## Method

Each run cloned the repository into a temporary directory, checked out one commit of `main`, and
copied in `stryker.config.json`, `.pi/tau.json`, `package.json`, and `bun.lock` from the setup
branch. It then ran `bunx --bun mutation changed <commit>~1`. The commit's own tests ran, so the
results show what that commit's tests killed, not what `main` kills today. The runs went two at a
time on a 32-core machine with Bun 1.4.4, so `concurrency: "50%"` gave each run 16 workers.

Survivors are `Survived` plus `NoCoverage` mutants. "Timeout" mutants are not in "Killed".

## Commits

| Commit    | Change                                                 | Mutants | Killed | Survived | No coverage | Timeout | Wall time |
| --------- | ------------------------------------------------------ | ------: | -----: | -------: | ----------: | ------: | --------: |
| `675f1a2` | count sub-agents in space and tab status (#7)          |     154 |    123 |       29 |           0 |       2 |      13 s |
| `c48dd81` | name tabs in the Go to panel the same way (#9)         |       1 |      1 |        0 |           0 |       0 |      13 s |
| `4599012` | restyle the sidebar's repository labels and rail (#8)  |     129 |    111 |       14 |           4 |       0 |      14 s |
| `189acd7` | add a Neovim-style normal mode (#6)                    |     368 |    290 |       60 |          18 |       0 |      14 s |
| `06e57fe` | restyle Koja with a light theme and rounded panes (#3) |      55 |     51 |        3 |           1 |       0 |      13 s |

Each run spent about 11 seconds on the dry run of 190 to 300 tests. Nearly all of it was the
preview-shell tests, which wait on real timers. They are now left out of the sandbox, see
`ignorePatterns`, and the dry run of the 369 remaining tests takes under a second. No run mutated a
file outside the `mutate` list below.

## Settings

| Setting                       | Value                                                                                                           | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testRunner`, `plugins`       | `bun`, `@hughescr/stryker-bun-runner`                                                                           | Koja's tests use `bun:test`. The runner gives per-test coverage. All five runs worked.                                                                                                                                                                                                                                                                                                                                                      |
| `bun.timeout`, `bun.bunArgs`  | `600000`, `--timeout 60000`                                                                                     | Copied from Mergit, where instrumented tests timed out with the defaults. Koja's dry run takes under a second, so these limits are never close. They were not measured here.                                                                                                                                                                                                                                                                |
| `coverageAnalysis`            | `perTest`                                                                                                       | Stryker runs only the tests that cover a mutant. Runs of 1 to 368 mutants took 13 to 14 seconds.                                                                                                                                                                                                                                                                                                                                            |
| `mutate`                      | `src/**/*.ts`, minus tests and the files listed below                                                           | Every production file is under `src/`. Only modules that `bun test` can load are mutated. See "Left-out modules".                                                                                                                                                                                                                                                                                                                           |
| `tsconfigFile`                | `stryker-no-tsconfig.json` (does not exist)                                                                     | Stryker core rewrites `tsconfig.json` through the TypeScript JavaScript API, which TypeScript 7 does not have. A missing file skips the rewrite.                                                                                                                                                                                                                                                                                            |
| `checkers`                    | `[]`                                                                                                            | A TypeScript checker needs the same API. The five runs had 0 invalid mutants, so no checker is needed.                                                                                                                                                                                                                                                                                                                                      |
| `ignoreStatic`                | `true`, set by the package                                                                                      | A mutant in code that runs while a file loads is not a test gap.                                                                                                                                                                                                                                                                                                                                                                            |
| `ignorers`                    | `tauMessageIgnorer`, added by the package                                                                       | It skips message text, as `AGENTS.md` asks not to test wording.                                                                                                                                                                                                                                                                                                                                                                             |
| `concurrency`                 | `50%`, `100%` in CI                                                                                             | Half the cores leaves room for other local work. The CI job writes a copy of the config with every core.                                                                                                                                                                                                                                                                                                                                    |
| `timeoutMS`, `timeoutFactor`  | `10000`, `4`                                                                                                    | Copied from Mergit. Runs had 0 to 2 timed-out mutants, and a timeout counts as a kill. The factor guards against slow 4-core CI runners.                                                                                                                                                                                                                                                                                                    |
| `ignorePatterns`              | `.tau`, `docs`, `herdr`, `tests/*.test.ts`, `dist`, `CHANGELOG.md`, `src/mods/koja-picker/previewShell.test.ts` | Stryker does not copy these into the sandbox. `herdr` holds only declarations. `tests/*.test.ts` holds the build, install, and lint checks, which need a build and are not unit tests. `previewShell.test.ts` tests the `preview.sh` shell script and imports no TypeScript source, so it can kill no mutant. Its tests run concurrently under `bun test`, but the runner runs them one at a time, which cost 10 to 20 seconds per dry run. |
| `tempDirName`, `cleanTempDir` | `.stryker-tmp`, `true`                                                                                          | A fixed folder in the repository, ignored by Git, removed after a run.                                                                                                                                                                                                                                                                                                                                                                      |
| `thresholds.break`            | set to `null` by the package                                                                                    | The report decides the exit code, not a score.                                                                                                                                                                                                                                                                                                                                                                                              |

## Left-out modules

Herdr's modules, such as `herdr`, `gpui-kit`, and `gpui-base`, exist only inside the Herdr app. A
module that imports one at run time, directly or through another module, fails to load under
`bun test`, so all its mutants would be `NoCoverage` noise. The `!` globs in `mutate` leave out
every such source file. `src/kit/modName.ts` is left out too: it reads a global that only the build
defines.

To find them, compare the files that `bun test src --coverage` lists with all source files. Then try
each missing file with `bun -e "await import('./<file>')"`. A file that loads but has no test stays
in, because its `NoCoverage` mutants are real gaps. `src/kit/fileStatus.ts` is one.
`src/kit/iconNames.ts` is another, and its module-level mutants are static, so `ignoreStatic` skips
them.

A module that a test loads only after it mocks Herdr's modules with `mock.module()` is left out too.
Examples are `src/kit/overlayOpen.ts` and the `main.ts` of several mods, so `src/mods/*/main.ts` is
left out as a whole. The Bun runner imports every mutated file before the tests run. That early
import fails without the mocks, and the dry run then fails, for example with
`Cannot find package 'gpui-kit'`. The runner's README lists this limitation for `mock.module()`. The
first run of `189acd7` stopped this way.

When you add a module that imports one of Herdr's modules at run time, add it to the `!` globs, even
when a test loads it through `mock.module()`.

## Advisory CI job

The `Mutation` job runs on pull requests, lists survivors, and is not a required check.
`timeout-minutes: 60` is far above the 14 seconds the runs above took, and it bounds a large
refactor, because the package has no mutant cap by default.

## Accepted survivors

These tables list the survivors that remain after the tests for each file. No test can kill them
through behavior a caller can observe. Each file was audited with `bunx --bun mutation audit`.

### src/kit/palette.ts

| Line | Mutator       | Reason                                                                                                                                |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 75   | StringLiteral | equivalent: the fallback token is the theme's `foreground`, so replacing the key `'foreground'` with `''` still reads the same value. |

### src/mods/koja-menu/entries.ts

| Line                                                      | Mutator               | Reason                                                                                                                  |
| --------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 105, 109, 128, 140-152, 162, 180, 183, 186, 191, 192, 196 | StringLiteral         | noise: label text and icon names only feed display. Actions and their arguments are unchanged.                          |
| 121                                                       | ConditionalExpression | equivalent: when `terminal` is null, `parent` is undefined, so the `parent === undefined` check still returns no entry. |

### src/mods/koja-modal/execute.ts

| Line | Mutator                                                | Reason                                                                                                       |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 60   | StringLiteral                                          | noise: the history's `space` field is stored but never read back.                                            |
| 96   | ConditionalExpression                                  | equivalent: the unchanged check above already guarantees the pane changed when this branch runs.             |
| 133  | ConditionalExpression, LogicalOperator, BlockStatement | equivalent: a null pane or tab makes `findIndex` return -1, so the function still returns without a command. |
| 146  | ConditionalExpression, BlockStatement                  | equivalent: `inTab` is non-empty whenever the index is valid, so the modulo result is always defined.        |
| 161  | ConditionalExpression, BlockStatement                  | equivalent: a null last pane matches no live pane, so the existence check returns without a command.         |
| 169  | ConditionalExpression, BlockStatement                  | equivalent: no live pane has a null tab, so the existence check returns without a command.                   |
| 194  | ConditionalExpression, BlockStatement                  | equivalent: no live pane has a null tab, so the existence check returns without a command.                   |
| 216  | ConditionalExpression, LogicalOperator, BlockStatement | equivalent: `spaceIndex` runs only with a non-null order, and a null current already gives index -1.         |
| 252  | ConditionalExpression                                  | equivalent: `current !== null` is already true whenever the hidden-space branch matters.                     |
| 258  | EqualityOperator                                       | equivalent: `step` is only 1 or -1, so `step >= 0` and `step > 0` agree.                                     |

### src/mods/koja-palette/entries.ts

| Line | Mutator          | Reason                                                                                 |
| ---- | ---------------- | -------------------------------------------------------------------------------------- |
| 242  | StringLiteral    | equivalent: `split` always yields at least one part, so the `noun` default never runs. |
| 251  | LogicalOperator  | noise: the fallback only changes the display title. Layout args and IDs are the same.  |
| 355  | MethodExpression | equivalent: `replaceAll` strips all whitespace, so trimming first changes nothing.     |
| 355  | Regex            | equivalent: the `g` flag already makes `/\s/` replace every whitespace character.      |

### src/mods/koja-picker/match.ts

| Line    | Mutator                                              | Reason                                                                                                |
| ------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 78      | ArrayDeclaration                                     | equivalent: every query letter has a table, so the `?? []` fallback never runs.                       |
| 94      | ConditionalExpression, EqualityOperator              | equivalent: `positions` is empty only for an empty query, and `isCompact([])` is true anyway.         |
| 104     | BlockStatement, ConditionalExpression, StringLiteral | equivalent: an empty query falls through to the same `{ score: 0, positions: [] }` result.            |
| 117     | BlockStatement                                       | equivalent: the `missing` flag only skips a search, and the letter lookup still returns null.         |
| 118     | BooleanLiteral                                       | equivalent: same as line 117.                                                                         |
| 122     | BlockStatement                                       | equivalent: a missing letter already makes `matchFrom` return null.                                   |
| 126-127 | StringLiteral, ArrayDeclaration                      | equivalent: the `?? ''` and `?? []` fallbacks never run for a non-empty query.                        |
| 130     | LogicalOperator                                      | equivalent: the first letter's lookup finds the same first occurrence from 0 or from that occurrence. |
| 139     | MethodExpression                                     | equivalent: retrying the first start gives the same null.                                             |

### src/mods/koja-picker/previewLifecycle.ts

| Line | Mutator                               | Reason                                                                                     |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| 44   | StringLiteral                         | equivalent: `show` sets `wanted` before any drain reads it.                                |
| 48   | BooleanLiteral                        | equivalent: `show` clears `blocked` before any drain runs.                                 |
| 106  | CallExpression                        | equivalent: `close` already removed the folder, so `forget` has no folder to remove.       |
| 115  | ConditionalExpression, BlockStatement | equivalent: after `close`, the drain loop checks `closed` and writes nothing.              |
| 191  | ConditionalExpression                 | equivalent: without a state path, the drain stops in `persist` before any host call.       |
| 264  | ArrowFunction                         | equivalent: `undefined` and `null` both fail the `!== 0` check, so the result is the same. |

### src/mods/koja-picker/rows.ts

| Line | Mutator                                                 | Reason                                                                                                               |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 55   | ConditionalExpression                                   | equivalent: `statusWords[null]` is `undefined`, which `bestFieldMatch` skips like `null`.                            |
| 136  | LogicalOperator                                         | equivalent: a space's status is the best of its tabs, so the same status word is already a tab field.                |
| 153  | ConditionalExpression                                   | equivalent: a null pane status is never in the filter list, so the null check changes nothing.                       |
| 159  | ConditionalExpression                                   | equivalent: a null status is never in the filter list, so the null check changes nothing.                            |
| 174  | BlockStatement, ConditionalExpression, EqualityOperator | equivalent: a tab with no matching pane and no matching tab has no rows anyway, so the early return only skips work. |
| 240  | BlockStatement, ConditionalExpression, StringLiteral    | equivalent: for a space with a name, an empty query leaves the pane target empty, as before.                         |
| 299  | BlockStatement, ConditionalExpression, StringLiteral    | equivalent: for a space with a name, an empty query scores 0 and keeps the same rows.                                |
| 324  | ConditionalExpression, StringLiteral                    | equivalent: with an empty query every group scores 0, so sorting changes nothing.                                    |
