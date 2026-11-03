# Koja

A developer cockpit built on the Herdr desktop app: the glue between coding agents, tickets in tikk,
and GitHub work, in one window. It is made of TypeScript mods that share one UI kit, plus the
layout, theme, and keys that use them. Read [the development guide](docs/development.md) for local
setup and verification.

- Run `bun run check` before finishing changes. It runs typechecking, lint with house style,
  formatting, Knip, and tests.
- Format with `bun run format`, and fix style with `bun run style:fix`. House style comes from
  `@sqve/seam`.
- Follow the decisions in [docs/adr](docs/adr/README.md), and record new decisions there. Read that
  guide before adding or changing an ADR. When details of a decision change, edit its ADR in place
  in the same change. Do not write documents that explain how a feature works; see
  [ADR 0001](docs/adr/0001-documentation-scope.md).
- Name values in camelCase and types in PascalCase. Never SCREAMING_CASE, not even for module
  constants.
- Declare a helper before the code that uses it. Join at most three checks in one condition, and do
  not mix `&&` with `||`; name the inner group instead.
- Comment only what the code cannot say, such as a constraint or a workaround. Do not describe the
  code's history.
- Add a changeset with `bun run changeset` when a change touches `src/**`. Release PRs are exempt;
  see [versioning](docs/development.md#versioning).
- Before finishing a document, check its local links and verify the commands it gives against the
  repository.

## Architecture

- Each surface is its own mod in `src/mods/<name>/`, and every mod draws through the kit in
  `src/kit/`. See [ADR 0004](docs/adr/0004-separate-mods-one-kit.md).
- The build bundles each mod into one `main.js` with the kit inside. Herdr's modules, such as
  `herdr` and `gpui-kit`, stay imports. See [ADR 0005](docs/adr/0005-typescript-bundled-per-mod.md).
- The kit owns every size, corner radius, text size, row, status mark, and icon. Zed's UI is the
  inspiration, not a spec to copy. Colors come from Herdr's theme tokens. See
  [ADR 0007](docs/adr/0007-one-ui-language.md).
- Never edit files in `~/.config/herdr-app` by hand. The installer writes them. See
  [ADR 0006](docs/adr/0006-install-real-files.md).
- The files the installer copies as they are live in `config/`, laid out as in Herdr's home:
  `keys.json`, `settings.json`, `layouts/`, and `themes/`.
- `herdr/herdr.d.ts` and `herdr/gpui-kit.d.ts` are the declarations of the Herdr release Koja
  targets, kept as Herdr wrote them. Replace them when moving to a new Herdr release.
- A mod derived from a Herdr mod records its Herdr source and release in `herdr/upstream.json`, and
  is listed in `NOTICE`. See [ADR 0008](docs/adr/0008-track-herdr-upstream.md).
- Herdr's own manual is `~/.config/herdr-app/AGENTS.md`, rewritten by Herdr on every start. Read it
  before changing a mod.

## Tests

- Test behavior a caller can observe. Do not test wording, constants, types, or internal calls.
- Keep tests next to source. Cross-module and tooling checks go in `tests/`.
- Use temporary directories for fixtures and remove them when the test finishes.
- Check a mod in Herdr with `herdr-app check` and `herdr-app shot`. Open its views with
  `herdr-app do`, and use synthetic input for what no command reaches, such as typing a query.
