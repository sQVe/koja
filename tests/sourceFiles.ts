import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const modsDirectory = 'src/mods';

export const typeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true });

  return entries
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
    .map((entry) => join(directory, entry));
};
