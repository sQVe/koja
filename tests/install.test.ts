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
import { install } from '../scripts/install.ts';

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
  install({ home, modsDirectory: mods, configDirectory: config, check });

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
      expect(await readdir(target)).toEqual(['.koja-install.json', 'mods']);
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
        modsDirectory: mods,
        configDirectory: config,
        check: passingCheck,
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', expect.stringContaining(home));
      expect(await readFile(join(target, 'mods', 'old', 'main.js'), 'utf8')).toBe('keep\n');
      expect(await readdir(target)).toEqual(['.koja-install.json', 'mods']);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
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
