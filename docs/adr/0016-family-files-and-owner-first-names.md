# ADR 0016: Family files inside modules, thin coordinators, and owner-first file names

**Date**: 2026-10-14\
**Status**: Accepted\
**Related**: [ADR 0008 (Capability modules with an enforced import table)](./0008-capability-modules.md),
[ADR 0010 (Every UI feature has a CLI equal)](./0010-cli-parity.md)

## Context

ADR 0008 decides which modules exist and which may import which. It says nothing about how code is
arranged inside a module, so features have gone into a few central files. `store/store.ts`,
`server/server.ts`, and `cli/parse.ts` each hold every family's code, and the store and server are
past 1200 lines.

Agents write most features as slices that run in parallel branches. When every slice edits the same
central file, the branches conflict there, and a reader must scan one long file to find one feature.
The conflicts come from shared editing paths, not from size: two branches that add a pane feature
and a tab feature both edit the same intent translator and the same option table.

Most features belong to one thing a user names: a workspace, a tab, a pane, a client, the session,
or the server. The CLI already groups its commands by these nouns, as ADR 0010 requires.

File names mix word orders today, such as `paneRows.ts` beside `failedPane.ts`, so a reader cannot
predict where a family's code lives.

## Decision

Inside each folder module, family code lives in private files named owner first, and the module's
coordinators hold only dispatch and ordering. Size is a reason to review a file, never a check that
fails.

### Families and owners

- A family is one user-facing noun: `workspace`, `tab`, `pane`, `client`, `session`, or `server`.
  Use the same noun for it in every module.
- Infrastructure that belongs to no family has its own owner noun, such as `row`, `input`, or
  `socket`.
- A family may have several files, one per behavior that changes on its own, such as parsing,
  execution, and resource ownership.
- Extract shared code when two existing consumers need it, whether they are in one family or two.

### Coordinators

- A coordinator dispatches to family files and keeps the order that must stay central:
  `store/store.ts` assigns revisions, `server/server.ts` replaces state and orders publication and
  effects, and `cli/parse.ts` dispatches command groups and parses the options every command shares.
  Entry files stay the public API that ADR 0008 defines.
- Coordinators hold no family-specific behavior. A feature adds or changes family files, and edits a
  coordinator only to register an intent, request, or command, or to change a public contract. Keep
  those edits small and explicit.

### File names

- Name a private file `<owner><job>` in camelCase, with a singular owner noun first:
  `paneTransitions.ts`, `paneRequests.ts`, `paneFailure.ts`, `paneReadOptions.ts`.
- A file may use the owner noun alone when that noun names what the file holds, such as
  `server/log.ts`. A plural noun alone names a collection, such as `protocol/messages.ts`.
- A plural job names a collection, such as `paneCommands.ts`; a singular job names one thing, such
  as `attachCommand.ts` for `koja attach`. A CLI file uses the command group as its owner.
- A test file keeps its source name with `.test`. A large unit test may split into
  `<source><Job>.test.ts` files next to the source, with shared setup in a `<source>Fixtures.ts`
  file, such as `src/ui/input.test.ts` and `src/ui/inputTabs.test.ts`. An integration test in
  `tests/` is named for its family and behavior, such as `paneHistoryCli.test.ts`, and shares setup
  through a `tests/<owner>Harness.ts` file.
- Functions start with a verb and types use PascalCase, as before. The owner-first order applies to
  file names only.

### Size

- Review a file over 500 lines and a function over 60 lines or with more than 4 parameters. Split by
  responsibility, not to meet a count. Keep a resource's lifetime and a state machine together even
  when that file stays long.
- Pass a typed intent or options object rather than adding positional parameters.
- These limits are review signals. No check fails on them.

## Consequences

### Positive

- Parallel slices for different families edit different files, so they conflict less.
- A reader finds a family's code by its noun: sorted listings group `pane*.ts` files together in
  every module.
- Coordinators stay short because they hold dispatch and ordering only.

### Negative

- One feature spans several small files across modules, so a change opens more files.
- Each new intent, request, or command still edits its coordinator once to register.
- Without a failing check, the size signals depend on review and can drift.
- Existing files that break the naming rule must be renamed, which touches their importers.

## Alternatives considered

### Keep growing the central files

Keep one file per module and rely on review to keep it readable. Rejected because every parallel
slice already edits the same blocks of the store, server, and parser.

### A hard line limit in lint

Let lint refuse files over 500 lines. Rejected because a count does not show ownership: it would
force splits of cohesive files such as the libghostty-vt bindings and the input tokenizer, while a
coordinator under the limit could still hold every family's code. Koja's lint fails on warnings, so
a warning level would block too.

### A line limit on entry files only

Limit only the public entry files. Rejected because the busiest shared file, `cli/parse.ts`, is
private, and the large integration tests are outside `src/`.

### One folder per feature across modules

A folder such as `src/pane/` holding the pane's store, server, and CLI code. Rejected because it
breaks the capability modules of ADR 0008: pure and I/O code would share a folder, and the import
table could no longer tell them apart.

### Split by kind of code

Files such as `types.ts`, `handlers.ts`, and `parsers.ts` inside each module. Rejected because one
feature would spread across every file, and ADR 0008 already refuses a shared `types.ts`.

### Qualifier-first file names

Names such as `failedPane.ts` or `readOptions.ts`. Rejected because they scatter a family's files in
sorted listings, and the reader must guess the word order.
