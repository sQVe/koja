import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const modsDirectory = 'src/mods';

// The direction mocks hold their own palettes, sizes, and text styles as tokens, so the raw color,
// size, and text checks skip them.
const rawStyleExemptDirectory = join(modsDirectory, 'koja-mocks', 'directions');

export const isRawStyleExempt = (finding: string): boolean =>
  finding.startsWith(`${rawStyleExemptDirectory}/`);

export const typeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true });

  return entries
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
    .map((entry) => join(directory, entry));
};
