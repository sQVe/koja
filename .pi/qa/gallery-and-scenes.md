# QA recipe: gallery and scenes

Drive the kit gallery, `koja-gallery`, and the mock scenes, `koja-mocks`, in the sandbox the brief
names. Follow [the rules for every section](../qa.md#rules-for-every-section) of the QA guide first.

## Entry points

| Entry point  | Command                                                          |
| ------------ | ---------------------------------------------------------------- |
| Gallery      | The palette entry `Kit gallery`                                  |
| Scene picker | `bun run sandbox do mod.open --name koja-mocks`                  |
| Capture      | `bun run mock:capture <scene> <new folder outside the worktree>` |

## Driving steps

1. Run `bun run sandbox shot <file>` and read the image to see the window.
2. Open the scene picker, and wait one second.
3. Type a scene name from `src/mods/koja-mocks/catalog.ts`, then run `key Return`.
4. Take a `shot` of the scene, then close it with `key Escape`.
5. Run the capture command, and list the new folder.

## Observable results

- The palette entry `Kit gallery` opens the gallery.
- `bun run sandbox do mod.open --name koja-mocks` opens the scene picker.
- After one second, a scene name from `src/mods/koja-mocks/catalog.ts` and `Return` open that scene.
- An unknown name shows an error.
- `Escape` closes the scene.
- `bun run mock:capture <scene> <new folder outside the worktree>` writes `shot.png`, `crop.png`,
  and `capture.json`, and closes the scene.
- The capture refuses when a `koja-mocks` overlay is open.

## Gotchas

- A scene in `koja-mocks` uses fake data. It never proves the real mod.
- The look of a scene is not testable here. The `judge-mock` skill decides it.
