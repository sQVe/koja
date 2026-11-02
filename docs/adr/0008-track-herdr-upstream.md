# ADR 0008: Forks keep their Herdr base and update by three-way merge

**Date**: 2026-11-02\
**Status**: Accepted\
**Related**: [ADR 0004 (Separate mods that share one UI kit)](./0004-separate-mods-one-kit.md),
[Herdr's shipped mods](https://github.com/herdrdev/herdr-app/tree/master/defaults/mods)

## Context

Several mods start as copies of Herdr's shipped mods. Herdr never updates a copy, and it changes
fast, so a copy misses Herdr's fixes from the day it is made. Herdr's repository keeps the shipped
mods under `defaults/mods/` at every release tag, so the exact source of a copy can be found again.

Herdr's mods are licensed under Apache-2.0, which requires a copy of the license and a notice of
changes in derived work.

## Decision

Each mod derived from a Herdr mod records the Herdr mod and release it came from. Moving to a new
Herdr release merges Herdr's changes into each derived mod with a three-way merge. The base is the
recorded release, ours is Koja's mod, and theirs is the new release. Then the merge is reviewed and
the recorded release is updated.

A clean merge is not proof of a working mod. Every merge is checked in Herdr and reviewed against
Herdr's changes.

`NOTICE` names each derived mod and its Herdr source, and the Apache-2.0 license text ships with
them.

## Consequences

### Positive

- Herdr's fixes reach derived mods at each upgrade.
- The license terms of derived code are met.

### Negative

- Mods that differ from their source in many lines produce more conflicts, which take manual work.
- Each Herdr release needs a deliberate upgrade step.

## Alternatives considered

### Never update copies

Treat each copy as Koja's own code from the day it is made. Rejected because Herdr changes fast and
copies fall behind its fixes.

### A patch set over Herdr's files

Keep only patches against the shipped mods and apply them at build time. Rejected because a heavily
restyled mod makes large patches that are harder to read and review than the mod itself.
