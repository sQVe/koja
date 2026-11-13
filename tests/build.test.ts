import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildMods } from '../scripts/build.ts';

let root: string;
let source: string;
let output: string;

const writeSource = async (path: string, content: string): Promise<void> => {
  const file = join(source, path);

  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, content);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-build-'));
  source = join(root, 'src', 'mods');
  output = join(root, 'dist', 'mods');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('buildMods', () => {
  test('bundles local modules into main.js and keeps Herdr modules as imports', async () => {
    await writeSource('../kit/size.ts', 'export const statusDotSize = 6;\n');

    await writeSource(
      'menu/main.ts',
      [
        "import { div } from 'gpui-kit';",
        "import { statusDotSize } from '../../kit/size.ts';",
        'export const dot = () => div().size(statusDotSize);',
        '',
      ].join('\n'),
    );

    await buildMods(source, output);

    const bundle = await readFile(join(output, 'menu', 'main.js'), 'utf8');

    expect(bundle).toMatch(/from\s*["']gpui-kit["']/);
    expect(bundle).toContain('statusDotSize = 6');
    expect(bundle).not.toMatch(/from\s*["'][^"']*kit\/size/);
  });

  test('bundles the shared data modules into an importing mod', async () => {
    await writeSource(
      '../data/snapshot.ts',
      "export const snapshotKey = 'koja.data.v1.snapshot';\n",
    );

    await writeSource(
      'spaces/main.ts',
      [
        "import { snapshotKey } from '../../data/snapshot.ts';",
        'export const key = () => snapshotKey;',
        '',
      ].join('\n'),
    );

    await buildMods(source, output);

    const bundle = await readFile(join(output, 'spaces', 'main.js'), 'utf8');

    expect(bundle).toContain('koja.data.v1.snapshot');
    expect(bundle).not.toMatch(/from\s*["'][^"']*data\/snapshot/);
  });

  test('copies files other than TypeScript and keeps their mode', async () => {
    await writeSource('picker/main.ts', 'export const picker = 1;\n');
    await writeSource('picker/helper.ts', 'export const helper = 1;\n');
    await writeSource('picker/mod.json', '{ "place": "none" }\n');
    await writeSource('picker/assets/folder.svg', '<svg/>\n');
    await writeSource('picker/preview.sh', '#!/bin/sh\n');
    await chmod(join(source, 'picker', 'preview.sh'), 0o755);

    await buildMods(source, output);

    const files = await readdir(join(output, 'picker'), { recursive: true });
    const preview = await stat(join(output, 'picker', 'preview.sh'));

    expect(files.toSorted()).toEqual([
      'assets',
      'assets/folder.svg',
      'main.js',
      'mod.json',
      'preview.sh',
    ]);

    expect(preview.mode & 0o777).toBe(0o755);
  });

  test('copies the kit icons into every mod', async () => {
    await writeSource('../kit/icons/plus.svg', '<svg id="plus"/>\n');
    await writeSource('../kit/icons/x.svg', '<svg id="x"/>\n');
    await writeSource('../kit/size.ts', 'export const iconSize = 14;\n');
    await writeSource('menu/main.ts', 'export const menu = 1;\n');
    await writeSource('tabs/main.ts', 'export const tabs = 1;\n');

    await buildMods(source, output);

    for (const name of ['menu', 'tabs']) {
      expect((await readdir(join(output, name, 'icons'))).toSorted()).toEqual([
        'plus.svg',
        'x.svg',
      ]);

      expect(await readFile(join(output, name, 'icons', 'x.svg'), 'utf8')).toBe('<svg id="x"/>\n');
    }
  });

  test('gives each bundle the name of its mod folder', async () => {
    await writeSource(
      '../kit/modName.ts',
      'declare const kojaModName: string;\nexport const modName = kojaModName;\n',
    );

    await writeSource(
      'koja-tabs/main.ts',
      "import { modName } from '../../kit/modName.ts';\nexport const path = 'mods/' + modName;\n",
    );

    await buildMods(source, output);

    const bundle = await readFile(join(output, 'koja-tabs', 'main.js'), 'utf8');

    expect(bundle).toContain('"koja-tabs"');
    expect(bundle).not.toContain('kojaModName');
  });

  test('removes mods left from an earlier build', async () => {
    await writeSource('tabs/main.ts', 'export const tabs = 1;\n');
    await mkdir(join(output, 'removed'), { recursive: true });
    await writeFile(join(output, 'removed', 'main.js'), '');

    const names = await buildMods(source, output);

    expect(names).toEqual(['tabs']);
    expect(await readdir(output)).toEqual(['tabs']);
  });

  test('names the mod that fails to build', async () => {
    await writeSource('broken/main.ts', 'export const broken = ;\n');

    const failure: unknown = await buildMods(source, output).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).toHaveProperty('message', 'Could not build mod broken');
  });

  test('builds nothing when there is no mods folder', async () => {
    expect(await buildMods(source, output)).toEqual([]);
  });
});
