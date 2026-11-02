# ADR 0007: One UI language through one kit

**Date**: 2026-11-02\
**Status**: Accepted\
**Related**: [ADR 0004 (Separate mods that share one UI kit)](./0004-separate-mods-one-kit.md),
[Zed's UI components](https://github.com/zed-industries/zed/tree/main/crates/ui)

## Context

Koja replaces many of Herdr's surfaces and adds its own, such as views of tickets and GitHub work.
Each surface was tuned on its own, so sizes, rows, icons, and status marks drifted between them.
Herdr's theme files set colors only. Sizes, corners, and text sizes live in each mod's code.

## Decision

Koja has one UI language, and the kit is the only place that defines it. Zed's UI is the main
inspiration: its scale for text, icons, spacing, and corners is the starting point, and Koja departs
from it where its own surfaces need something else. Koja does not try to look like Zed.

### Rules

- The kit owns every size, corner radius, and text size. Mods use the kit's named values.
- The kit draws every status mark and every list row. A mod never draws its own.
- Colors come from Herdr's theme tokens, so the theme file sets them. The kit holds no color values.
- The kit owns its icons, so no mod depends on an icon from a shipped Herdr mod.
- A gallery view renders every kit component in every state. It is the visual check of the UI
  language, compared with `herdr-app shot`.

Where a rule can be checked mechanically, a lint or test enforces it, so drift fails the check
rather than showing up on screen.

## Consequences

### Positive

- One change in the kit changes every surface the same way.
- New surfaces start from the same parts, so they match without tuning.

### Negative

- Herdr opens some surfaces itself, such as its prompts and notifications. Koja cannot replace them,
  so they keep Herdr's look.
- A surface that needs a size the kit lacks must add it to the kit first.

## Alternatives considered

### Match Zed exactly

Copy Zed's components as closely as Herdr allows. Rejected because Koja's surfaces, such as ticket
and GitHub views, have no Zed counterpart, and copying Zed would decide their design by a product
with other goals.

### A written style guide

Write the sizes down and follow them by hand. Rejected because each surface's own copy of the values
drifted while the rules were known.
