# ADR 0002: Own repository on the shared project base

**Date**: 2026-11-02\
**Status**: Accepted\
**Related**: [Seam](https://github.com/sQVe/seam),
[ADR 0003 (Bun as runtime, package manager, test runner, and bundler)](./0003-bun-toolchain.md)

## Context

Koja is a developer cockpit built on the Herdr desktop app. It joins coding agents, tickets in Tikk,
and GitHub work in one window, and may take over parts of Mergit. Herdr draws it from mods, a
layout, a theme, and keys in `~/.config/herdr-app`, a folder that also holds files Herdr writes and
rewrites itself.

Koja holds code that needs types, tests, lint, and review, like the user's other projects. Tikk and
Mergit already share a toolchain, CI, release flow, and house style, so moving between them needs no
relearning.

## Decision

Koja lives in its own public repository and uses the same base as Tikk and Mergit. It installs into
`~/.config/herdr-app` ([ADR 0006](./0006-install-real-files.md)) and is never edited in place there.

### What is shared

- Tooling: vite-plus for lint and format, `@sqve/seam` for house style, Knip, and Changesets for
  releases. Shared files match Tikk and Mergit, except for the project name and description.
- CI, Renovate, CodeRabbit, the Grove worktree setup, and the GitHub ruleset.

### What stays local

- Koja has no TUI and ships no binary. It needs neither OpenTUI nor React.
- Koja has no mutation testing until it holds logic worth mutating.
- ADRs after 0003 and the architecture section of `AGENTS.md` belong to Koja.

## Consequences

### Positive

- A fix to tooling, CI, or house style is copied as is from the sibling projects.
- Koja can be shared as a Herdr layout from a public repository.

### Negative

- Nothing catches drift between the repositories. The author of a change to a shared file must make
  it in each.
- Koja is not in the dotfiles repository, so a new machine needs one more clone.

## Alternatives considered

### A folder in the dotfiles repository

Keep Koja under `config/herdr-app/` in the dotfiles. Rejected because Koja is a project that grows
with its own features, the dotfiles have no license, no CI, and no review flow, and Koja includes
code derived from Herdr's Apache-2.0 mods that needs its own license and notice.

### A different stack

Choose tools that fit Koja alone. Rejected because the shared base removes relearning and lets fixes
move between repositories.
