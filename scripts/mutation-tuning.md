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
