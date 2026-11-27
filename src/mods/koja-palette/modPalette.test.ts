import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readModPalettes } from './modPalette.ts';

const homes: string[] = [];

const newHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), 'koja-palette-'));

  homes.push(home);

  return home;
};

const writeMod = async (
  home: string,
  name: string,
  manifest: unknown,
  { main = true, text = JSON.stringify(manifest) } = {},
): Promise<void> => {
  const directory = join(home, 'mods', name);

  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'mod.json'), text);

  if (main) {
    await writeFile(join(directory, 'main.js'), '');
  }
};

const entry = (command: string, args: Record<string, unknown> = {}): unknown => ({
  title: 'Do the thing',
  command,
  args,
});

afterEach(async () => {
  for (const home of homes.splice(0)) {
    await rm(home, { recursive: true, force: true });
  }
});

describe('readModPalettes', () => {
  test('answers each mod that declares entries with the mod that declared them', async () => {
    const home = await newHome();

    await writeMod(home, 'koja-gallery', {
      palette: [entry('mod.open', { name: 'koja-gallery' })],
    });

    await writeMod(home, 'plain', { name: 'plain' });

    expect(await readModPalettes(home)).toEqual([
      { mod: 'koja-gallery', entries: [entry('mod.open', { name: 'koja-gallery' })] },
    ]);
  });

  test('skips a mod whose manifest is not JSON and one with no palette list', async () => {
    const home = await newHome();

    await writeMod(home, 'broken', null, { text: '{{{not json' });
    await writeMod(home, 'other', { palette: 'nope' });
    await writeMod(home, 'kept', { palette: [entry('tab.new')] });

    expect((await readModPalettes(home)).map((palette) => palette.mod)).toEqual(['kept']);
  });

  test('skips a mod.open entry whose target has no main.js or is no mod', async () => {
    const home = await newHome();

    await writeMod(home, 'declarer', {
      palette: [
        entry('mod.open', { name: 'gone' }),
        entry('mod.open', { name: 'nobody' }),
        entry('mod.open', { name: 'present' }),
      ],
    });

    await writeMod(home, 'gone', {}, { main: false });
    await writeMod(home, 'present', {});

    const [palette] = await readModPalettes(home);

    expect(palette?.entries).toEqual([entry('mod.open', { name: 'present' })]);
  });

  test('skips an entry that is not an object', async () => {
    const home = await newHome();

    await writeMod(home, 'declarer', { palette: ['nope', entry('tab.new')] });

    expect((await readModPalettes(home))[0]?.entries).toEqual([entry('tab.new')]);
  });

  test('answers nothing when the app has no mods folder', async () => {
    expect(await readModPalettes(join(await newHome(), 'missing'))).toEqual([]);
  });

  test('skips a folder that holds a manifest but no main.js', async () => {
    const home = await newHome();

    await writeMod(home, 'ghost', { palette: [entry('tab.new')] }, { main: false });

    expect(await readModPalettes(home)).toEqual([]);
  });
});
