# ADR 0005: TypeScript mods bundled into one file each

**Date**: 2026-11-02\
**Status**: Accepted\
**Related**: [ADR 0003 (Bun as runtime, package manager, test runner, and bundler)](./0003-bun-toolchain.md),
[ADR 0004 (Separate mods that share one UI kit)](./0004-separate-mods-one-kit.md)

## Context

Herdr runs only JavaScript. It writes type declarations for its API into its folder, rewritten on
every start to match the installed version, and the shipped mods are plain JavaScript checked
against them.

The kit must reach every mod folder, because Herdr resolves a mod's imports only inside its own
folder.

## Decision

Mods and the kit are written in TypeScript. The build bundles each mod into one `main.js`, with the
kit and every other local module inside it. Imports of Herdr's own modules, such as `herdr` and
`gpui-kit`, stay imports. Files that are not TypeScript, such as `mod.json`, icons, and scripts, are
copied as they are.

Mods are typechecked against a copy of Herdr's declarations kept in the repository for the Herdr
version Koja targets. Updating that copy is part of moving to a new Herdr version, and its diff
shows what changed in Herdr's API.

## Consequences

### Positive

- The compiler checks every mod against Herdr's API and the kit's types.
- The bundle is the only way the kit reaches a mod, so no hand-made copy of the kit can drift.

### Negative

- Errors that Herdr reports point at the built `main.js`, not the TypeScript source.
- Herdr's docs and shipped mods are JavaScript, so their examples need small changes to use.
- The declarations do not always match what Herdr accepts. For example, `theme()` returns plain
  strings where elements expect `#`-prefixed colors, so the kit converts them once.

## Alternatives considered

### JavaScript checked with `checkJs`

Write mods in JavaScript, as Herdr's own mods are, and check them with the declarations. Rejected
because an installer is needed anyway, so a build step costs little, and TypeScript gives each mod
and the kit declared types.

### A copy script for the kit

Copy `src/kit/` into every mod folder at install time. Rejected because bundling already puts the
kit into each `main.js`.
