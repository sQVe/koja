# Architecture decision records

Record lasting decisions and the reasons behind them, not how a feature works.

## Writing ADRs

Follow [shared ADR 0001](../stomme/shared/adr/0001-documentation-scope.md) for documentation scope
and the ADR process. Before opening the [template](./TEMPLATE.md), answer:

- What choice are we making, and what lasting reason stands behind it?
- What credible alternative did we consider, and why did we reject it?

If the answers only restate what the code does, do not write an ADR. Code and tests hold behavior. A
feature change does not require a new document.

Number a new ADR after the highest number in the index and the Retired table. To read a retired ADR,
run `git show <commit>:docs/adr/<file>` with the commit in its row.

## Index

### Project and toolchain

- [0002: Own repository on the shared project base](./0002-shared-project-base.md)
- [0003: Bun as runtime, package manager, test runner, and bundler](./0003-bun-toolchain.md)
- [0006: Install real files with an allowlisted installer](./0006-install-real-files.md)
- [0008: Forks keep their Herdr base and update by three-way merge](./0008-track-herdr-upstream.md)
- [0018: Dev scripts and mods trust the local user](./0018-trust-the-local-user.md)

### Mods and UI

- [0004: Separate mods that share one UI kit](./0004-separate-mods-one-kit.md)
- [0005: TypeScript mods bundled into one file each](./0005-typescript-bundled-per-mod.md)
- [0007: One UI language through one kit](./0007-one-ui-language.md)
- [0009: A two-tone base with rounded cards and foreground focus](./0009-flat-gray-cards.md)
- [0010: Koja rolls up space and tab status itself](./0010-koja-rolls-up-agent-status.md)
- [0011: Two AI judges from different model families gate UI mocks](./0011-two-ai-judges-gate-ui-mocks.md)
- [0012: Normal mode gives each part of the app one plain letter](./0012-one-plain-letter-per-part.md)
- [0013: Insert mode only types, and global keys are an allowlist](./0013-insert-mode-only-types.md)
- [0014: Normal mode keeps the keyboard and forwards list keys to the marked section](./0014-normal-mode-forwards-list-keys.md)
- [0015: The space menu creates and removes worktrees with Grove](./0015-grove-runs-space-menu-worktrees.md)
- [0016: One data owner hosted by koja-spaces](./0016-one-data-owner-hosted-by-spaces.md)
- [0017: The sandbox is a verification target](./0017-sandbox-is-a-verification-target.md)
- [0019: Koja draws agent asks in its own floating window](./0019-koja-draws-asks-in-its-own-window.md)

## Retired

| ADR  | Title               | Replaced by                                                         | Last commit |
| ---- | ------------------- | ------------------------------------------------------------------- | ----------- |
| 0001 | Documentation scope | [Shared ADR 0001](../stomme/shared/adr/0001-documentation-scope.md) | c0651df     |
