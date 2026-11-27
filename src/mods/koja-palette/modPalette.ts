import { exists, readdir, readFile } from 'fs/promises';

import { isRecord, recordOf, stringOf } from '../../kit/fields.ts';

export interface ModPalette {
  mod: string;
  entries: unknown[];
}

const hasMain = async (modsDirectory: string, name: string): Promise<boolean> => {
  try {
    return await exists(`${modsDirectory}/${name}/main.js`);
  } catch {
    return false;
  }
};

const installedMods = async (modsDirectory: string): Promise<string[]> => {
  try {
    const names = await readdir(modsDirectory);
    const visible = names.filter((name) => !name.startsWith('.'));

    const checked = await Promise.all(
      visible.map(async (name) => ({
        name,
        installed: await hasMain(modsDirectory, name),
      })),
    );

    return checked
      .filter((pair) => pair.installed)
      .map((pair) => pair.name)
      .toSorted();
  } catch {
    return [];
  }
};

const opensMissingMod = (entry: Record<string, unknown>, mods: readonly string[]): boolean => {
  if (entry['command'] !== 'mod.open') {
    return false;
  }

  const name = stringOf(recordOf(entry['args'])['name']);

  return name === null || !mods.includes(name);
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

    return records.filter((entry) => !opensMissingMod(entry, mods));
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
  if (home.trim() === '') {
    return [];
  }

  const modsDirectory = `${home}/mods`;
  const mods = await installedMods(modsDirectory);
  const palettes = await Promise.all(mods.map((mod) => paletteOfMod(modsDirectory, mod, mods)));

  return palettes.filter((palette) => palette !== null);
};
