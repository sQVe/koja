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
built mods, its layout, its theme, its fonts, `keys.json`, and `settings.json`. It removes only
files that an earlier install wrote and the current one no longer has, so it records the files it
writes in Herdr's folder. The record also names the checkout it installed from, whether every mod
check passed, and the source files that decide what it installs. It reserves its record, lock, and
staging names, so no plan or record can name them. It replaces a symlink in its way with a real file
and never writes through one. Each file goes through a temporary file in its destination folder,
receives its mode, and is renamed into place, so Herdr never reads a half-written file. It runs
`herdr-app check` on a staged copy of the intended final mod tree, so a stale file cannot hide a
missing asset. A watch mode builds and installs on every save, so edits stay in the repository.

The installer checks the staged mod tree before it changes the live one. When every mod check
passes, it publishes the staged mod files and then copies `keys.json`, the layout, the theme, the
fonts, and `settings.json`, and removes stale files. A failed check leaves the live mods, earlier
config, and stale files in place, so keys and layouts keep naming mods that worked. After a
successful install, every matching planned file counts as owned, including one it did not rewrite.
The record marks an install complete only after config and cleanup succeed, and keeps partial
ownership after a failure so the next run can recover.

One checkout has a single writer for the shared `dist/mods` output. A build and an install take the
same `flock` on the checkout directory: the build holds it while it stages and publishes the mods,
and the installer holds it before it reads that tree. Every installer takes the checkout lock before
the home lock, so two installs cannot wait on each other in opposite orders. A sandbox launcher
holds that same checkout lock around its whole build and install command; the inner acquisition
skips the lock only because that caller already holds it. An installer refuses a missing built mods
tree with its own error instead of treating it as an empty plan, so a reader never mistakes an
absent build for a deliberate empty one.

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
- A failed check can leave new mod files beside the old config until the next install.

## Alternatives considered

### Symlinks from the repository

Link each file into Herdr's folder. Rejected because Herdr refuses assets and imports through
symlinks and does not reload when the target changes.

### Config first, then checks

Copy every file, then check the mods. Rejected because a failed check then leaves `keys.json` or the
layout pointing at a mod that does not work, such as a key that opens a broken overlay.

### A repository in Herdr's folder

Make `~/.config/herdr-app` the working tree and ignore Herdr's files. Rejected because the folder
mixes Herdr's rewritten files and changing state with the source, so every Herdr version can add
files that the ignore list must learn about.
