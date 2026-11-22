import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { CheckResult } from '../scripts/install.ts';
import { install } from '../scripts/install.ts';

let root: string;
let home: string;
let mods: string;
let config: string;

const oldKeys = '{ "global": {} }\n';
const newKeys = '{ "global": { "ctrl-b": "koja-modal" } }\n';

const writeAt = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

const passingCheck = async (): Promise<CheckResult> => ({ passed: true, output: 'passed' });

const failingCheck = async (): Promise<CheckResult> => ({ passed: false, output: 'failed' });

const exists = async (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false,
  );

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const run = async (check: (folder: string) => Promise<CheckResult>): ReturnType<typeof install> =>
  install({
    home,
    checkout: root,
    inputs: [],
    modsDirectory: mods,
    configDirectory: config,
    check,
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-install-order-'));
  home = join(root, 'herdr-app');
  mods = join(root, 'dist', 'mods');
  config = join(root, 'config');

  await mkdir(home, { recursive: true });
  await writeAt(join(mods, 'koja-tabs', 'main.js'), 'export default 1;\n');
  await writeAt(join(mods, 'koja-tabs', 'icons', 'x.svg'), '<svg/>\n');
  await writeAt(join(config, 'keys.json'), oldKeys);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('install order', () => {
  test('leaves the installed keys.json unchanged when a mod check fails', async () => {
    await run(passingCheck);
    await writeAt(join(config, 'keys.json'), newKeys);

    const result = await run(failingCheck);
    const checkStates = result.checks.map((check) => ({ mod: check.mod, passed: check.passed }));

    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe(oldKeys);
    expect(checkStates).toEqual([{ mod: 'koja-tabs', passed: false }]);
  });

  test('installs the new keys.json when every mod check passes', async () => {
    await run(passingCheck);
    await writeAt(join(config, 'keys.json'), newKeys);

    const result = await run(passingCheck);

    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe(newKeys);
  });

  test('leaves a stale mod from the earlier install in place when a mod check fails', async () => {
    await writeAt(join(mods, 'koja-old', 'main.js'), 'export default 2;\n');
    await run(passingCheck);
    await rm(join(mods, 'koja-old'), { recursive: true });
    await writeAt(join(config, 'keys.json'), newKeys);

    const result = await run(failingCheck);

    const staleMod = await readFile(join(home, 'mods', 'koja-old', 'main.js'), 'utf8');
    const installedKeys = await readFile(join(home, 'keys.json'), 'utf8');

    expect(result.removed).toEqual([]);

    expect(staleMod).toBe('export default 2;\n');
    expect(installedKeys).toBe(oldKeys);
  });

  test('checks the intended final mod tree instead of stale files from the earlier install', async () => {
    await run(passingCheck);
    await rm(join(mods, 'koja-tabs', 'icons', 'x.svg'));

    const result = await run(async (folder) => ({
      passed: await exists(join(folder, 'icons', 'x.svg')),
      output: `checked ${folder}`,
    }));

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.mod).toBe('koja-tabs');
    expect(result.checks[0]?.passed).toBe(false);

    expect(await exists(join(home, 'mods', 'koja-tabs', 'icons', 'x.svg'))).toBe(true);
    expect(await readFile(join(home, 'keys.json'), 'utf8')).toBe(oldKeys);
  });

  test('leaves an old mod file in place when a directory replaces it and the check fails', async () => {
    await writeAt(join(mods, 'koja-tabs', 'asset'), 'old file\n');
    await run(passingCheck);
    await rm(join(mods, 'koja-tabs', 'asset'));
    await writeAt(join(mods, 'koja-tabs', 'asset', 'x.svg'), '<svg/>\n');

    const result = await run(failingCheck);

    expect(result.removed).toEqual([]);
    expect(await readFile(join(home, 'mods', 'koja-tabs', 'asset'), 'utf8')).toBe('old file\n');
    expect(await exists(join(home, 'mods', 'koja-tabs', 'asset', 'x.svg'))).toBe(false);
  });

  test('leaves an old mod directory in place when a file replaces it and the check fails', async () => {
    await writeAt(join(mods, 'koja-tabs', 'asset', 'x.svg'), '<svg/>\n');
    await run(passingCheck);
    await rm(join(mods, 'koja-tabs', 'asset'), { recursive: true });
    await writeAt(join(mods, 'koja-tabs', 'asset'), 'new file\n');

    const result = await run(failingCheck);

    expect(result.removed).toEqual([]);
    expect((await lstat(join(home, 'mods', 'koja-tabs', 'asset'))).isDirectory()).toBe(true);

    expect(await readFile(join(home, 'mods', 'koja-tabs', 'asset', 'x.svg'), 'utf8')).toBe(
      '<svg/>\n',
    );
  });

  test('serializes two installs for one home', async () => {
    let releaseFirst!: () => void;
    let startFirst!: () => void;

    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstStarted = new Promise<void>((resolve) => {
      startFirst = resolve;
    });

    await writeAt(join(mods, 'koja-extra', 'main.js'), 'extra\n');

    const first = install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: async () => {
        startFirst();
        await firstReleased;

        return { passed: true, output: 'first' };
      },
    });

    await firstStarted;
    await rm(join(mods, 'koja-extra'), { recursive: true });

    const second = install({
      home,
      checkout: root,
      inputs: [],
      modsDirectory: mods,
      configDirectory: config,
      check: async () => ({ passed: true, output: 'second' }),
    });

    try {
      await delay(200);

      expect(await exists(join(home, 'mods', 'koja-extra', 'main.js'))).toBe(false);
    } finally {
      releaseFirst();
    }

    const [, secondResult] = await Promise.all([first, second]);

    expect(secondResult.removed).toContain('mods/koja-extra/main.js');
    expect(await exists(join(home, 'mods', 'koja-extra', 'main.js'))).toBe(false);
  });
});
