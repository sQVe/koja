# ADR 0017: The mutation gate runs only the unit tests next to the mutated file

**Date**: 2026-10-18\
**Status**: Accepted

## Context

Koja checks changed lines with StrykerJS. Stryker runs tests for each mutant. The tests under
`tests/` start servers, open sockets, and spawn panes. On one machine they took 146 s, while the
unit tests under `src/` took 2 s.

Stryker's per-test coverage tells the gate which tests reach a line. A line that no selected test
reaches is reported as no coverage. About 40 production files have no unit test next to them, and
their behavior is covered only from `tests/`.

## Decision

The mutation gate runs only the unit tests in the same folder as the mutated file, never those of
another folder or `tests/`. The gate runs the `@sqve/mutation` command with its
`--same-folder-tests` switch, which starts Stryker once per folder and lists that folder's
`*.test.ts` and `*.test.tsx` files. A changed line in a file with no unit test next to it fails the
gate as no coverage until the change adds one.

The gate also leaves out `src/server/processInfo.ts`, `src/server/socketPath.ts`,
`src/server/rowPublisher.ts`, and `src/client/clipboardWrite.ts`. Their tests start processes, open
sockets, or wait on real time, so each mutant costs seconds. The mutation bunfig skips their test
files too.

## Consequences

### Positive

- A run over a typical change takes seconds, so the gate can run on every pull request.
- A change to untested code gets a unit test in the same change.

### Negative

- An edit to one of the files without a unit test needs a new test, even when `tests/` already
  covers the behavior.
- The four left-out modules are never mutated, so their changes pass without a check.

## Alternatives considered

### Run every test, including `tests/`

Run the whole suite for each mutant. Rejected because the integration tests make a run take minutes,
and tests that wait on real time fail under load.

### Pick the tests for each file by hand

List the integration tests that cover each module. Rejected because the list drifts from the code,
and a missing entry reports a gap that does not exist.
