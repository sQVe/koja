# Architecture decision records

Record lasting decisions and the reasons behind them, not how a feature works.

## Before writing

Follow [ADR 0001](./0001-documentation-scope.md) for documentation scope. Before opening the
[template](./TEMPLATE.md), answer:

- What choice are we making, and what lasting reason stands behind it?
- What credible alternative did we consider, and why did we reject it?

If the answers only restate what the code does, do not write an ADR. Code and tests hold behavior. A
feature change does not require a new document.

Use a title that names the choice, and state that choice in the first sentence of the Decision
section. Give each rejected or deferred alternative its own heading under Alternatives considered.
An ADR is not a feature summary, implementation plan, or acceptance checklist.

A new ADR is Accepted. Merging its PR is the approval, so there is no Proposed stage.

## Keeping ADRs current

An ADR states the current decision. When its details change, edit it in place. Supersede it only
when the core choice reverses. The new ADR then states the whole current rule and has a Supersedes
line that names the old ADR without a link. Delete the old file, and add a row for it to the Retired
table. Numbers are never reused. To read a retired ADR, run `git show <commit>:docs/adr/<file>` with
the commit in its row.

## Index

### Documentation

- [0001: Documentation scope](./0001-documentation-scope.md)

### Project and toolchain

- [0002: Own repository on the shared project base](./0002-shared-project-base.md)
- [0003: Bun as runtime, package manager, test runner, and bundler](./0003-bun-toolchain.md)
- [0006: Install real files with an allowlisted installer](./0006-install-real-files.md)
- [0008: Forks keep their Herdr base and update by three-way merge](./0008-track-herdr-upstream.md)

### Mods and UI

- [0004: Separate mods that share one UI kit](./0004-separate-mods-one-kit.md)
- [0005: TypeScript mods bundled into one file each](./0005-typescript-bundled-per-mod.md)
- [0007: One UI language through one kit](./0007-one-ui-language.md)

## Retired

| ADR | Title | Replaced by | Last commit |
| --- | ----- | ----------- | ----------- |
