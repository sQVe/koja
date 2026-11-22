# ADR 0018: Dev scripts and mods trust the local user

**Date**: 2026-11-22\
**Status**: Accepted\
**Related**: [ADR 0006 (Install real files with an allowlisted installer)](./0006-install-real-files.md),
[ADR 0017 (The sandbox is a verification target)](./0017-sandbox-is-a-verification-target.md)

## Context

Koja's dev scripts and Herdr mods run as the local user on that user's machine. They read the user's
Git repositories, run `git` and Grove, copy files into the Herdr home, and run a sandbox under
`/var/tmp`. An external scan treated some of those paths and props as hostile input and asked for
confinement.

A co-writer with the user's UID already has the user's access. Confinement would guard the user
against that co-writer, which is not the threat Koja faces. Another UID is a different boundary:
Ruta creates an initialized sandbox root with owner-only permissions, and the installer refuses a
symlinked Herdr home.

## Decision

Dev scripts and mods trust the local user. A mod or script assumes the person running it can already
read and change the files it touches.

They still reject input that changes what a command does, such as a branch name that starts with
`-`, and they still refuse to install through a symlinked folder. They add no sandbox, privilege
drop, or ownership check against a co-writer with the same UID.

### Residual risk

- The sandbox fixture script creates `/var/tmp/ruta-<name>` and opens `machine.lock` before `up()`
  validates the root. A co-writer with the same UID can replace the fixture files there.
- A folder can be replaced between the check and the use, so Git or Grove then acts on whatever now
  sits at that path.
- The picker takes its preview folder and state file from its props, so the mod that opens it names
  the files it resumes.

## Consequences

### Positive

- Checks stay about mistakes and accidents, not about an attacker who already has the user's access.
- A local user's own scripts and mods run without extra prompts, setup, or a second identity.

### Negative

- Koja cannot protect the user from another process or co-writer with the same UID.
- A requirement to handle hostile input needs a new decision, not a patch to one mod.

## Alternatives considered

### Confine every script and mod

Run each script and mod under a sandbox that sees only its inputs. Rejected because a local
co-writer already has the user's access, and the sandbox would take away the file and process access
the mods need.

### Guard every path at each use

Re-check ownership and paths wherever a mod or script uses one. Deferred because it does not stop a
local user who owns the files, and it adds a step to every action.
