# ADR 0003: Bun as runtime, package manager, test runner, and bundler

**Date**: 2026-11-02\
**Status**: Accepted\
**Related**: [ADR 0002 (Own repository on the shared project base)](./0002-shared-project-base.md),
[ADR 0005 (TypeScript mods bundled into one file each)](./0005-typescript-bundled-per-mod.md)

## Context

Herdr runs mods as JavaScript in its own engine, not in Bun or Node. Koja writes mods in TypeScript,
so a build step must turn each mod into JavaScript. The build, the installer, and the tests all run
on the developer's machine and in CI.

Tikk and Mergit use Bun for everything, so the same choice keeps the shared base intact.

## Decision

Koja uses Bun as its runtime, package manager, test runner, and bundler. `Bun.build` bundles each
mod. One runtime covers the tooling, the build, the installer, and every test.

### Toolchain

- `bun.lock` is the only lockfile. `packageManager` in `package.json` pins the Bun version, and CI
  installs that version.
- Tests use `bun test` and import from `bun:test`.
- `bun run test` spreads test files over worker processes with `--parallel --no-isolate`. Each
  worker keeps one module registry across the files it runs, so a file must leave no state behind
  for the next one. Every `mock.module()` of the same module must expose the same export names,
  because Bun fixes them at the first mock. The mutation runner runs all files in one process the
  same way.
- `bun run check` runs typechecking, house style, formatting, and Knip at once, then the tests.
- Vite+ stays for lint, formatting, and staged checks. TypeScript, Knip, and Changesets also stay.
- Scripts and hooks run installed command-line tools with `bunx --bun`, so tools with a Node shebang
  run on Bun.
- The CI job that reports mutation survivors runs on Node with `npx`, not Bun. It holds a token that
  can write pull request comments, so it installs nothing from the repository and runs a pinned
  published reporter instead, which needs Node.

## Consequences

### Positive

- The tooling, the build, and all tests share one runtime and one test runner.
- The bundler needs no extra dependency.

### Negative

- GitHub's dependency graph does not read `bun.lock`, so dependency review does not cover locked
  package versions.
- Tools that assume Node need `bunx --bun`, and a tool that fails on Bun has no Node fallback.
- Bun's bundler targets browsers and Bun, not Herdr's engine. A mod that uses a feature Herdr's
  engine lacks builds fine and fails only in Herdr.

## Alternatives considered

### Isolated test files

Run each test file in a fresh global with `--parallel` alone or `--isolate`. Rejected because every
file then evaluates its imports again, which grows with the suite, and the mutation runner cannot
isolate files, so a file that leaks state must be fixed anyway.

### esbuild or tsc for the build

Add esbuild, or emit with `tsc`. Rejected because Bun already bundles, and `tsc` would emit one file
per module, which Herdr cannot import across mod folders.
