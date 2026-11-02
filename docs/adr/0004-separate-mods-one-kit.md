# ADR 0004: Separate mods that share one UI kit

**Date**: 2026-11-02\
**Status**: Accepted\
**Related**: [ADR 0005 (TypeScript mods bundled into one file each)](./0005-typescript-bundled-per-mod.md),
[ADR 0007 (One UI language through one kit)](./0007-one-ui-language.md),
[Herdr 98 roles](https://github.com/herdrdev/herdr-app/tree/master/defaults/mods/win98),
[Whitby](https://github.com/shellscape/herdr-whitby)

## Context

Koja replaces several of Herdr's surfaces: the spaces sidebar, the tab bar, the Go to picker, the
command palette, and two menus. Each was a separate mod with its own copy of shared drawing code,
and the copies drifted. The status mark was drawn three different ways.

Herdr lets a mod import only files inside its own folder, so mods cannot share a module at run time.
Herdr's keys open a mod by name only and cannot pass props, and a key command reaches every shown
copy of a mod. Every hot reload keeps the old code in memory, so a larger mod slows reloads sooner.

## Decision

Each surface stays its own mod, and all mods draw through one kit. The kit lives once in `src/kit/`,
and each mod lives in `src/mods/<name>/`. The build puts the kit into every mod that uses it
([ADR 0005](./0005-typescript-bundled-per-mod.md)).

A mod may open another of Koja's mods by name. These names are the coupling between mods, so a
rename changes every mod, layout, and key that names it in the same change.

## Consequences

### Positive

- Keys, the layout's `terminal_menu`, and overlays open mods by name, as Herdr expects.
- A save reloads one mod, not the whole setup.
- A mod stays close to the shipped mod it came from, which keeps upstream merges small
  ([ADR 0008](./0008-track-herdr-upstream.md)).

### Negative

- Each mod carries its own copy of the kit in its built file.
- A kit change reaches the window only after the affected mods are built and installed again.

## Alternatives considered

### One mod with roles

Build every surface as one mod that picks a role from its props, as Herdr 98 and Whitby do. One
`kit.js` then needs no build. Deferred because keys cannot pass a role, so the picker and palette
need launcher mods, each role must ignore commands meant for another, and every save reloads all the
code. It becomes the better choice if Herdr lets `mod.open` pass props.

### Fewer forks

Give the menus and palette back to Herdr's shipped versions and keep the kit for the rest. Rejected
because no setting changes their row height, corners, or text size, so they could not follow the UI
language.

### A Git dependency for the kit

Herdr's UI library can load a package from a Git repository named in a mod's `gpui-shell.json`.
Rejected for now because Herdr does not document it, it fetches on every reload, each kit edit needs
a commit, and its cache grows with every commit. An installer is needed anyway, so it removes no
step.
