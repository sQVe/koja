import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

const run = async (check: () => Promise<CheckResult>): ReturnType<typeof install> =>
  install({ home, modsDirectory: mods, configDirectory: config, check });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-install-order-'));
  home = join(root, 'herdr-app');
  mods = join(root, 'dist', 'mods');
  config = join(root, 'config');

  await mkdir(home, { recursive: true });
  await writeAt(join(mods, 'koja-tabs', 'main.js'), 'export default 1;\n');
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
});
