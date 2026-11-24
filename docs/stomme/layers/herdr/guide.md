# Herdr guide

Apply these rules with the [TypeScript coding guide](../../languages/typescript/guide.md) to every
file of a Herdr mod project. They add to that guide and never loosen it. Each rule starts with its
ID in the [rules table](../../shared/rules.md).

Herdr runs only JavaScript, and it resolves a mod's imports only inside that mod's folder.

- `herdr-mod-bundle`: Write mods in TypeScript. The build bundles each mod into one `main.js`, with
  every local module inside it, shared UI code included. Imports of Herdr's own modules, such as
  `herdr` and `gpui-kit`, stay imports.
- `herdr-mod-files`: Keep the file names Herdr reads fixed: `main.js` for the bundle and `mod.json`
  for the manifest. The build writes `main.js` beside the mod's sources. `pnpm run mod:install`
  copies `main.js` and `mod.json` into Herdr's mods folder. Add each other file the mod needs at run
  time, such as an icon, to that script.
- `herdr-declarations`: Typecheck mods against the declarations that the pinned Herdr writes with
  `herdr-app types`. Generate them on install, and never commit them. Regenerate them as part of
  moving to a new Herdr version.
