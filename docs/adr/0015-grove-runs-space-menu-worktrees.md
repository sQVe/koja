# ADR 0015: The space menu creates and removes worktrees with Grove

**Date**: 2026-11-13\
**Status**: Accepted\
**Related**: [ADR 0004 (Separate mods that share one UI kit)](./0004-separate-mods-one-kit.md),
[ADR 0010 (Koja rolls up space and tab status itself)](./0010-koja-rolls-up-agent-status.md),
[Grove](https://github.com/sqve/grove)

## Context

The user keeps each repository as a Grove workspace: a folder with a `.bare` repository and one
folder per worktree. Grove creates and removes the worktrees in it, and runs the workspace's add
hooks.

Herdr's `worktree` dialog runs `git worktree` itself and puts each new checkout under
`~/.herdr/worktrees/<repo>/<branch>`. A worktree made from the space menu therefore lands outside
the workspace, and Grove's hooks never run for it.

## Decision

The space menu's New worktree and Remove worktree open Koja's own `koja-worktree` dialog, which runs
Grove instead of Herdr's dialog. Open worktree still opens Herdr's dialog, because listing checkouts
does not create any.

### Where Grove runs

- Grove runs from the workspace root, the parent of the `.bare` common directory, on the space's
  machine. A space outside a Grove workspace shows an error and runs nothing.
- Koja does not pass `--herdr`. That flag needs `herdr-app` on the machine where Grove runs, which a
  remote space may not have. Koja opens and closes the space itself.

### When Remove asks first

- Remove asks first, with a danger button, only when the worktree has uncommitted changes or an
  agent runs in the space, as the status of ADR 0010 reports it. Grove gets `--force` only after the
  user confirmed.
- A clean worktree without an agent is removed at once, because nothing is lost.
- A failed Git check never counts as clean, so it shows an error and runs nothing.

## Consequences

### Positive

- Every worktree made from the space menu lives in its Grove workspace, with its hooks run.
- A safe remove takes one click, and a risky one always asks.

### Negative

- New worktree and Remove worktree work only in Grove workspaces.
- The `worktree` key binding still opens Herdr's dialog, so the menu shows no shortcut for New
  worktree and Remove worktree.
- The `+` menu's New worktree still uses Herdr's dialog until it moves to Grove too.

## Alternatives considered

### Keep Herdr's dialog

Let Herdr's dialog create and remove worktrees. Rejected because its checkouts land outside the
Grove workspace.

### Let Grove open and close the space

Run Grove with `--herdr` and let it open or close the Herdr space. Rejected because it needs
`herdr-app` on the machine that runs Grove, which fails for remote spaces.

### Always ask before a remove

Show the confirm dialog for every remove. Rejected because a clean worktree without an agent loses
nothing, so the question only adds a click.
