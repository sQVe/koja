# Koja

A developer cockpit built on the Herdr desktop app: the glue between coding agents, tickets in tikk,
and GitHub work, in one window. It is made of TypeScript mods that share one UI kit, plus the
layout, theme, and keys that use them. Read [the development guide](docs/development.md) for local
setup and verification.

- Fix style with `bun run style:fix`. House style comes from `@sqve/stomme-ts-style`.
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

- Do not test wording, constants, types, or internal calls.
- Try and QA mods in the sandbox only: `bun run sandbox up`, `shot`, the input commands, and `down`.
  Tau launches it as the `sandbox` verification target in `.pi/tau.json`, and `.pi/qa.md` holds the
  QA guide. The sandbox runs on [ruta](https://github.com/sQVe/ruta); install it with
  `cargo install --git https://github.com/sQVe/ruta --tag v0.2.1 --locked ruta`. Never use
  `ydotool`, and never run `herdr-app do`, `hc`, or synthetic input against the user's real window
  or core. See [Sandbox](docs/development.md#sandbox).

<!-- prettier-ignore-start -->
<!-- stomme:start -->
# Shared rules

- Run the full check before finishing changes: `bun run --bun check`.
- Format with the `format` script in `package.json`.
- Follow the decisions in [docs/adr](docs/adr/README.md).
- Follow the shared ADRs in [docs/stomme/shared/adr](docs/stomme/shared/adr/README.md).
- Record new decisions in [docs/adr](docs/adr/README.md).
- Edit an ADR in place when its details change.
- Comment only what the code cannot say. Never describe history.
- Document decisions, not features. See [ADR 0001](docs/stomme/shared/adr/0001-documentation-scope.md).
- Read [the general guide](docs/stomme/shared/coding.md).
- Read [the TypeScript guide](docs/stomme/languages/typescript/guide.md).
- Read [the herdr guide](docs/stomme/layers/herdr/guide.md).
<!-- stomme:end -->
<!-- prettier-ignore-end -->
