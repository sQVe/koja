import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { iconNames } from '../src/kit/iconNames.ts';

interface SourceLine {
  path: string;
  line: number;
  text: string;
}

const kitDirectory = 'src/kit';
const modsDirectory = 'src/mods';

// The style methods that set a size, a spacing, a corner radius, or a text size.
const sizedMethods = [
  'size',
  'w',
  'h',
  'min_w',
  'max_w',
  'min_h',
  'max_h',
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'gap',
  'rounded',
  'text_size',
  'top',
  'bottom',
  'left',
  'right',
];

const sizedCallPattern = new RegExp(String.raw`\.(?:${sizedMethods.join('|')})\(\s*-?\d`);

const typeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true });

  return entries
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
    .map((entry) => join(directory, entry));
};

const sourceLines = async (directory: string): Promise<SourceLine[]> => {
  const files = await typeScriptFiles(directory);

  const contents = await Promise.all(
    files.map(async (path) => ({ path, text: await readFile(path, 'utf8') })),
  );

  return contents.flatMap(({ path, text }) =>
    text.split('\n').map((lineText, index) => ({ path, line: index + 1, text: lineText })),
  );
};

const isComment = (text: string): boolean => text.trimStart().startsWith('//');

const linesMatching = async (directory: string, pattern: RegExp): Promise<string[]> => {
  const lines = await sourceLines(directory);

  return lines
    .filter((line) => !isComment(line.text) && pattern.test(line.text))
    .map((line) => `${line.path}:${line.line}: ${line.text.trim()}`);
};

describe('the UI language', () => {
  test('the kit holds no color values', async () => {
    expect(await linesMatching(kitDirectory, /#[\da-f]{3,8}\b/i)).toEqual([]);
  });

  test('every icon the kit names has a file, and every file is named', async () => {
    const files = await readdir(join(kitDirectory, 'icons'));
    const named = iconNames.map((name) => `${name}.svg`);

    expect(files.toSorted()).toEqual(named.toSorted());
  });

  test('mods draw icons only through the kit', async () => {
    const drawsOwnIcon = /\b(?:svg|image)\s*\(|import\s*\{[^}]*\b(?:svg|image)\b[^}]*\}\s*from/;

    expect(await linesMatching(modsDirectory, drawsOwnIcon)).toEqual([]);
  });

  test('mods name no asset of Herdr or of another mod', async () => {
    expect(await linesMatching(modsDirectory, /['"`](?:mods|frame|icons)\//)).toEqual([]);
  });

  test('mods take every size from the kit', async () => {
    expect(await linesMatching(modsDirectory, sizedCallPattern)).toEqual([]);
  });
});
