# ADR 0006: Install real files with an allowlisted installer

**Date**: 2026-11-02\
**Status**: Accepted\
**Related**: [ADR 0002 (Own repository on the shared project base)](./0002-shared-project-base.md)

## Context

Herdr reads Koja's files from `~/.config/herdr-app`. That folder also holds Herdr's own mods and
screens, which it replaces on every start, and state it writes all the time: window state, shared
mod state, layout clicks, and type declarations in every mod folder.

Herdr refuses image assets behind a symlink, refuses imports that resolve through one, and does not
reload a mod when a symlink's target changes. This holds for a symlinked file and for a symlinked
mod folder.

## Decision

An installer copies real files into `~/.config/herdr-app`. It writes only the files Koja owns: its
built mods, its layout, its theme, `keys.json`, and `settings.json`. It removes only files that an
earlier install wrote and the current one no longer has, so it records the files it writes in
Herdr's folder. It replaces a symlink in its way with a real file and never writes through one. It
runs `herdr-app check` on every installed mod. A watch mode builds and installs on every save, so
edits stay in the repository.

`keys.json`, the layout, and `settings.json` live in the repository, because they name Koja's mods
and theme, and a rename must change them in the same commit.

## Consequences

### Positive

- Herdr sees ordinary files, so assets load and saves reload as Herdr expects.
- Herdr's own files and state are never touched.

### Negative

- An edit made directly in `~/.config/herdr-app` is lost at the next install.
- Live editing needs the watch mode running.
- Settings are per person, so a second machine with other needs must split them out.

## Alternatives considered

### Symlinks from the repository

Link each file into Herdr's folder. Rejected because Herdr refuses assets and imports through
symlinks and does not reload when the target changes.

### A repository in Herdr's folder

Make `~/.config/herdr-app` the working tree and ignore Herdr's files. Rejected because the folder
mixes Herdr's rewritten files and changing state with the source, so every Herdr version can add
files that the ignore list must learn about.
