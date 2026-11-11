import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { CheckResult } from '../scripts/install.ts';
import { install, readRecord, shippedInputs, trustedRoot } from '../scripts/install.ts';

let root: string;
let home: string;
let mods: string;
let config: string;
let checked: string[];

const writeAt = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

const passingCheck = async (folder: string): Promise<CheckResult> => {
  checked.push(folder);

  return { passed: true, output: `check passed: ${folder}` };
};

const run = async (
  check: (folder: string) => Promise<CheckResult> = passingCheck,
): ReturnType<typeof install> =>
  install({
    home,
    checkout: root,
    inputs: [],
    modsDirectory: mods,
    configDirectory: config,
    check,
  });

const exists = async (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-install-'));
  home = join(root, 'herdr-app');
  mods = join(root, 'dist', 'mods');
  config = join(root, 'config');
  checked = [];

  await mkdir(home, { recursive: true });
  await writeAt(join(mods, 'koja-tabs', 'main.js'), 'export default 1;\n');
  await writeAt(join(mods, 'koja-tabs', 'icons', 'x.svg'), '<svg/>\n');
  await writeAt(join(config, 'keys.json'), '{ "global": {} }\n');
  await writeAt(join(config, 'layouts', 'koja.json'), '{ "id": "root" }\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('install', () => {
  test('copies the built mods and the config files into Herdr home', async () => {
    await run();

    expect(await readFile(join(home, 'mods', 'koja-tabs', 'main.js'), 'utf8')).toBe(
      'export default 1;\n',
    );

    expect(await readFile(join(home, 'mods', 'koja-tabs', 'icons', 'x.svg'), 'utf8')).toBe(
      '<svg/>\n',
    );

    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe('{ "global": {} }\n');
    expect(await readFile(join(home, 'layouts', 'koja.json'), 'utf8')).toBe('{ "id": "root" }\n');
  });

  test('keeps the mode of each file', async () => {
    await writeAt(join(mods, 'koja-tabs', 'preview.sh'), '#!/bin/sh\n');
    await chmod(join(mods, 'koja-tabs', 'preview.sh'), 0o755);

    await run();

    const installed = await stat(join(home, 'mods', 'koja-tabs', 'preview.sh'));

    expect(installed.mode & 0o777).toBe(0o755);
  });

  test('replaces a symlink with a real file and leaves its target alone', async () => {
    const dotfile = join(root, 'dotfiles', 'keys.json');

    await writeAt(dotfile, '{ "old": true }\n');
    await symlink(dotfile, join(home, 'keys.json'));

    await run();

    const installed = await lstat(join(home, 'keys.json'));

    expect(installed.isSymbolicLink()).toBe(false);
    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe('{ "global": {} }\n');
    expect(await readFile(dotfile, 'utf8')).toBe('{ "old": true }\n');
  });

  test('refuses to write through a symlinked folder and writes nothing there', async () => {
    const elsewhere = join(root, 'elsewhere');

    await mkdir(elsewhere);
    await symlink(elsewhere, join(home, 'layouts'));

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining(join(home, 'layouts')));
    expect(await exists(join(elsewhere, 'koja.json'))).toBe(false);
  });

  test('refuses a symlinked Herdr home and changes nothing inside or outside it', async () => {
    const target = await mkdtemp(join(tmpdir(), 'koja-install-target-'));

    try {
      await writeAt(join(target, 'mods', 'old', 'main.js'), 'keep\n');

      await writeFile(
        join(target, '.koja-install.json'),
        JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
      );

      await rm(home, { recursive: true });
      await symlink(target, home);

      const failure: unknown = await run().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', expect.stringContaining(home));
      expect(await readFile(join(target, 'mods', 'old', 'main.js'), 'utf8')).toBe('keep\n');
      expect((await readdir(target)).toSorted()).toEqual(['.koja-install.json', 'mods']);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test('refuses a symlinked Herdr home given with a trailing slash', async () => {
    const target = await mkdtemp(join(tmpdir(), 'koja-install-target-'));

    try {
      await writeAt(join(target, 'mods', 'old', 'main.js'), 'keep\n');

      await writeFile(
        join(target, '.koja-install.json'),
        JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
      );

      await rm(home, { recursive: true });
      await symlink(target, home);

      const failure: unknown = await install({
        home: `${home}/`,
        checkout: root,
        inputs: [],
        modsDirectory: mods,
        configDirectory: config,
        check: passingCheck,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', expect.stringContaining(home));
      expect(await readFile(join(target, 'mods', 'old', 'main.js'), 'utf8')).toBe('keep\n');
      expect((await readdir(target)).toSorted()).toEqual(['.koja-install.json', 'mods']);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  test('refuses a symlinked ancestor of Herdr home', async () => {
    const actual = join(root, 'actual');
    const linked = join(root, 'linked');

    await mkdir(actual);
    await symlink(actual, linked);

    const linkedHome = join(linked, 'herdr-app');

    await mkdir(join(actual, 'herdr-app'));

    const failure: unknown = await install({
      home: linkedHome,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining(linkedHome));
    expect(await exists(join(actual, 'herdr-app', 'keys.json'))).toBe(false);
  });

  test('records a file when chmod fails after its bytes are written', async () => {
    const smallConfig = join(root, 'chmod-config');
    const smallMods = join(root, 'chmod-mods');

    await writeAt(join(smallConfig, 'extra.json'), 'written\n');
    await mkdir(smallMods);

    const base = {
      home,
      checkout: root,
      inputs: [],
      modsDirectory: smallMods,
      configDirectory: smallConfig,
      check: passingCheck,
    };

    await install({
      ...base,
      chmodFile: async () => {
        throw new Error('injected chmod failure');
      },
    }).catch(() => undefined);

    const record = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8')) as {
      files: string[];
    };

    expect(record.files).toContain('extra.json');

    await rm(join(smallConfig, 'extra.json'));

    const result = await install(base);

    expect(result.removed).toContain('extra.json');
  });

  test('removes files an earlier install wrote that the current one lacks', async () => {
    await writeAt(join(mods, 'koja-old', 'main.js'), 'export default 2;\n');
    await run();
    await rm(join(mods, 'koja-old'), { recursive: true });

    const result = await run();

    expect(result.removed).toEqual(['mods/koja-old/main.js']);
    expect(await exists(join(home, 'mods', 'koja-old'))).toBe(false);
  });

  test('leaves files it never wrote, even beside its own', async () => {
    await writeAt(join(home, 'mods', 'koja-tabs', 'gpui-kit.d.ts'), 'declare module "x";\n');
    await writeAt(join(home, 'mods', 'my-menu', 'main.js'), 'export default 3;\n');
    await writeAt(join(home, 'layouts', 'my-main.json'), '{}\n');

    await run();
    await rm(join(mods, 'koja-tabs'), { recursive: true });
    await run();

    expect(await exists(join(home, 'mods', 'koja-tabs', 'main.js'))).toBe(false);
    expect(await exists(join(home, 'mods', 'koja-tabs', 'gpui-kit.d.ts'))).toBe(true);
    expect(await exists(join(home, 'mods', 'my-menu', 'main.js'))).toBe(true);
    expect(await exists(join(home, 'layouts', 'my-main.json'))).toBe(true);
  });

  test('never removes a path outside Herdr home that its record names', async () => {
    const outside = join(root, 'outside.txt');

    await writeFile(outside, 'keep\n');

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['../outside.txt', outside] }),
    );

    await run();

    expect(await readFile(outside, 'utf8')).toBe('keep\n');
  });

  test('keeps a stale file when its parent folder is a symlink', async () => {
    const elsewhere = join(root, 'elsewhere');
    const outside = join(elsewhere, 'main.js');

    await writeAt(outside, 'keep\n');
    await mkdir(join(home, 'mods'), { recursive: true });
    await symlink(elsewhere, join(home, 'mods', 'old'));

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
    );

    const failure: unknown = await run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(await readFile(outside, 'utf8')).toBe('keep\n');
  });

  test('keeps earlier destinations when a later destination is rejected', async () => {
    const dotfile = join(root, 'dotfiles', 'keys.json');
    const elsewhere = join(root, 'elsewhere');

    await writeAt(dotfile, '{ "old": true }\n');
    await mkdir(elsewhere);
    await symlink(dotfile, join(home, 'keys.json'));
    await mkdir(join(home, 'mods'), { recursive: true });
    await symlink(elsewhere, join(home, 'mods', 'old'));

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
    );

    const failure: unknown = await run().catch((error: unknown) => error);
    const installed = await lstat(join(home, 'keys.json'));

    expect(failure).toBeInstanceOf(Error);
    expect(installed.isSymbolicLink()).toBe(true);
    expect(await readFile(dotfile, 'utf8')).toBe('{ "old": true }\n');
    expect(await exists(join(elsewhere, 'main.js'))).toBe(false);
  });

  test('removes a stale symlink, reports it, and cleans its folder', async () => {
    const elsewhere = join(root, 'elsewhere');
    const outside = join(elsewhere, 'main.js');

    await writeAt(outside, 'keep\n');
    await mkdir(join(home, 'mods', 'old'), { recursive: true });
    await symlink(outside, join(home, 'mods', 'old', 'main.js'));

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['mods/old/main.js'] }),
    );

    const result = await run();

    expect(result.removed).toContain('mods/old/main.js');
    expect(await exists(join(home, 'mods', 'old', 'main.js'))).toBe(false);
    expect(await exists(join(home, 'mods', 'old'))).toBe(false);
    expect(await readFile(outside, 'utf8')).toBe('keep\n');
  });

  test('does not read or write through a symlinked record', async () => {
    const externalRecord = join(root, 'external-record.json');
    const externalText = `${JSON.stringify({ version: 1, files: ['mods/keep/main.js'] })}\n`;

    await writeAt(join(home, 'mods', 'keep', 'main.js'), 'keep\n');
    await writeFile(externalRecord, externalText);
    await symlink(externalRecord, join(home, '.koja-install.json'));

    await run();

    expect(await readFile(join(home, 'mods', 'keep', 'main.js'), 'utf8')).toBe('keep\n');
    expect(await readFile(externalRecord, 'utf8')).toBe(externalText);

    const record = await lstat(join(home, '.koja-install.json'));

    const written = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8')) as {
      files: string[];
    };

    expect(record.isSymbolicLink()).toBe(false);
    expect(written.files).toContain('mods/koja-tabs/main.js');
  });

  test('leaves an unchanged file in place', async () => {
    await run();

    const before = await stat(join(home, 'keys.json'));
    const result = await run();
    const after = await stat(join(home, 'keys.json'));

    expect(result.written).toEqual([]);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test('records the files it wrote so a retry can remove an orphan after a failed copy', async () => {
    await writeAt(join(config, 'extra.json'), 'orphan\n');

    await install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
      chmodFile: async (path) => {
        if (path.endsWith('extra.json')) {
          throw new Error('injected chmod failure');
        }
      },
    }).catch(() => undefined);

    await rm(join(config, 'extra.json'));

    const result = await run();

    expect(result.removed).toContain('extra.json');
    expect(await exists(join(home, 'extra.json'))).toBe(false);
  });

  test('keeps a user file at a plan the installer never reached', async () => {
    const smallConfig = join(root, 'small-config');
    const smallMods = join(root, 'small-mods');

    await writeAt(join(smallConfig, 'a.json'), 'new a\n');
    await writeAt(join(smallConfig, 'z.json'), 'new z\n');
    await mkdir(smallMods);

    const entries = (await readdir(smallConfig, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    const first = entries[0];
    const second = entries[1];

    if (first === undefined || second === undefined) {
      throw new Error('need two files');
    }

    await mkdir(join(home, first), { recursive: true });
    await writeAt(join(home, second), 'user data\n');

    const options = {
      home,
      checkout: root,
      inputs: [],
      modsDirectory: smallMods,
      configDirectory: smallConfig,
      check: passingCheck,
    };

    await install(options).catch(() => undefined);

    await rm(join(home, first), { recursive: true, force: true });
    await rm(join(smallConfig, second));

    await install(options);

    expect(await readFile(join(home, second), 'utf8')).toBe('user data\n');
  });

  test('prefers the user home root over a nested temporary folder', () => {
    const userHome = '/home/me';
    const temporary = '/home/me/linked/temporary';

    expect(trustedRoot('/home/me/linked/temporary/herdr-app', userHome, temporary)).toBe(userHome);
  });

  test('uses the temporary root when the home is only inside it', () => {
    expect(trustedRoot('/tmp/work/herdr-app', '/home/me', '/tmp/work')).toBe('/tmp/work');
  });

  test('uses the filesystem root when the home is outside both roots', () => {
    expect(trustedRoot('/opt/herdr-app', '/home/me', '/tmp/work')).toBe('/');
  });

  test('refuses a linked folder inside the user home above a nested temporary folder', async () => {
    const userHome = join(root, 'user');
    const actual = join(root, 'actual');
    const linked = join(userHome, 'linked');
    const temporary = join(linked, 'temporary');

    await mkdir(userHome);
    await mkdir(join(actual, 'temporary', 'herdr-app'), { recursive: true });
    await symlink(actual, linked);

    const failure: unknown = await install({
      home: join(temporary, 'herdr-app'),
      roots: { userHome, temporary },
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expect.stringContaining(linked));
    expect(await exists(join(actual, 'temporary', 'herdr-app', 'keys.json'))).toBe(false);
  });

  test('records the checkout it installed from and that every mod check passed', async () => {
    await run();

    const record: unknown = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8'));

    expect(record).toMatchObject({ checkout: root, allChecksPassed: true });
  });

  test('records that a mod check failed', async () => {
    await run(async () => ({ passed: false, output: 'failed' }));

    const record: unknown = JSON.parse(await readFile(join(home, '.koja-install.json'), 'utf8'));

    expect(record).toMatchObject({ checkout: root, allChecksPassed: false });
  });

  test('lists the shipped inputs of a checkout with their times, without test files and built mods', async () => {
    await writeAt(join(root, 'src', 'kit', 'row.ts'), 'export {};\n');
    await writeAt(join(root, 'src', 'kit', 'row.test.ts'), 'export {};\n');
    await writeAt(join(root, 'package.json'), '{}\n');

    const inputs = await shippedInputs(root);
    const paths = inputs.map((input) => input.path).toSorted();
    const row = inputs.find((input) => input.path === 'src/kit/row.ts');
    const rowStat = await stat(join(root, 'src', 'kit', 'row.ts'));

    expect(paths).toEqual([
      'config/keys.json',
      'config/layouts/koja.json',
      'package.json',
      'src/kit/row.ts',
    ]);

    expect(row?.modifiedAt).toBe(rowStat.mtimeMs);
  });

  test('records the shipped inputs it was given, not the files of the checkout', async () => {
    const inputs = [
      { path: 'package.json', modifiedAt: 1500.25 },
      { path: 'config/keys.json', modifiedAt: 2 },
    ];

    await install({
      home,
      checkout: root,
      inputs,
      modsDirectory: mods,
      configDirectory: config,
      check: passingCheck,
    });

    const record = await readRecord(home);

    expect(record?.origin?.inputs).toEqual([
      { path: 'config/keys.json', modifiedAt: 2 },
      { path: 'package.json', modifiedAt: 1500.25 },
    ]);
  });

  test.each([
    ['a plain list of paths', ['package.json']],
    ['an input without a time', [{ path: 'package.json' }]],
    ['an input without a path', [{ modifiedAt: 2 }]],
    ['no list', { path: 'package.json', modifiedAt: 2 }],
  ])('reads a record that holds %s as a record without origin', async (_, inputs) => {
    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, checkout: root, allChecksPassed: true, inputs, files: [] }),
    );

    expect(await readRecord(home)).toEqual({ files: [], origin: null });
  });

  test('runs on a home whose record holds a plain list of input paths', async () => {
    await writeAt(join(home, 'mods', 'koja-old', 'main.js'), 'export default 2;\n');

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({
        version: 1,
        checkout: root,
        allChecksPassed: true,
        inputs: ['package.json'],
        files: ['mods/koja-old/main.js'],
      }),
    );

    const result = await run();

    expect(result.removed).toEqual(['mods/koja-old/main.js']);
  });

  test('reads a record without shipped inputs as a record without origin', async () => {
    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({
        version: 1,
        checkout: root,
        allChecksPassed: true,
        files: ['keys.json'],
      }),
    );

    expect(await readRecord(home)).toEqual({ files: ['keys.json'], origin: null });
  });

  test('removes a stale file named by a record without shipped inputs', async () => {
    await writeAt(join(home, 'mods', 'koja-old', 'main.js'), 'export default 2;\n');

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({
        version: 1,
        checkout: root,
        allChecksPassed: true,
        files: ['mods/koja-old/main.js'],
      }),
    );

    const result = await run();

    expect(result.removed).toEqual(['mods/koja-old/main.js']);
    expect(await exists(join(home, 'mods', 'koja-old', 'main.js'))).toBe(false);
  });

  test('removes a stale file named by a record without a checkout or a check result', async () => {
    await writeAt(join(home, 'mods', 'koja-old', 'main.js'), 'export default 2;\n');

    await writeFile(
      join(home, '.koja-install.json'),
      JSON.stringify({ version: 1, files: ['mods/koja-old/main.js'] }),
    );

    const result = await run();

    expect(result.removed).toEqual(['mods/koja-old/main.js']);
    expect(await exists(join(home, 'mods', 'koja-old', 'main.js'))).toBe(false);
  });

  test('checks every installed mod and reports each result', async () => {
    await writeAt(join(mods, 'koja-menu', 'main.js'), 'export default 4;\n');

    const result = await run(async (folder) => {
      checked.push(folder);

      return { passed: !folder.endsWith('koja-menu'), output: `checked ${folder}` };
    });

    expect(checked.toSorted()).toEqual([
      join(home, 'mods', 'koja-menu'),
      join(home, 'mods', 'koja-tabs'),
    ]);

    expect(result.checks.filter((check) => !check.passed).map((check) => check.mod)).toEqual([
      'koja-menu',
    ]);
  });
});
