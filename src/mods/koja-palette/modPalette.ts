// eslint-disable-next-line unicorn/prefer-node-protocol -- Herdr's runtime declares "fs/promises".
import { exists, readdir, readFile } from 'fs/promises';

import { isRecord, recordOf, stringOf } from '../../kit/fields.ts';

export interface ModPalette {
  mod: string;
  entries: unknown[];
}

const modNames = async (modsDirectory: string): Promise<string[]> => {
  try {
    const names = await readdir(modsDirectory);

    return names.filter((name) => !name.startsWith('.')).toSorted();
  } catch {
    return [];
  }
};

const hasMain = async (modsDirectory: string, name: string): Promise<boolean> => {
  try {
    return await exists(`${modsDirectory}/${name}/main.js`);
  } catch {
    return false;
  }
};

const opensMissingMod = async (
  entry: Record<string, unknown>,
  mods: readonly string[],
  modsDirectory: string,
): Promise<boolean> => {
  if (entry['command'] !== 'mod.open') {
    return false;
  }

  const name = stringOf(recordOf(entry['args'])['name']);

  if (name === null || !mods.includes(name)) {
    return true;
  }

  return !(await hasMain(modsDirectory, name));
};

const paletteOf = async (
  modsDirectory: string,
  mod: string,
  mods: readonly string[],
): Promise<unknown[]> => {
  try {
    const text = await readFile(`${modsDirectory}/${mod}/mod.json`, 'utf8');
    const parsed: unknown = JSON.parse(text);
    const palette = recordOf(parsed)['palette'];

    if (!Array.isArray(palette)) {
      return [];
    }

    const records = palette.filter((entry) => isRecord(entry));

    const checked = await Promise.all(
      records.map(async (entry) => ({
        entry,
        missing: await opensMissingMod(entry, mods, modsDirectory),
      })),
    );

    return checked.filter((pair) => !pair.missing).map((pair) => pair.entry);
  } catch {
    return [];
  }
};

const paletteOfMod = async (
  modsDirectory: string,
  mod: string,
  mods: string[],
): Promise<ModPalette | null> => {
  const entries = await paletteOf(modsDirectory, mod, mods);

  return entries.length === 0 ? null : { mod, entries };
};

export const readModPalettes = async (home: string): Promise<ModPalette[]> => {
  const modsDirectory = `${home}/mods`;
  const mods = await modNames(modsDirectory);
  const palettes = await Promise.all(mods.map((mod) => paletteOfMod(modsDirectory, mod, mods)));

  return palettes.filter((palette) => palette !== null);
};
