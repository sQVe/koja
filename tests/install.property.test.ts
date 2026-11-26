import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { CheckResult } from '../scripts/install.ts';
import { install, readRecord } from '../scripts/install.ts';
import { seededRandom } from './seeded.ts';

const pool = [
  'config/keys.json',
  'config/layouts/koja.json',
  'config/theme.json',
  'mods/koja-one/main.js',
  'mods/koja-one/icons/x.svg',
  'mods/koja-two/main.js',
];

let root: string;
let home: string;
let mods: string;
let config: string;

const writeAt = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

const modPaths = pool.filter((path) => path.startsWith('mods/'));
const configPaths = pool.filter((path) => !path.startsWith('mods/'));

// Every plan carries at least one mod, so the record always stores a real check result.
const choose = (random: () => number): string[] => {
  const chosenMods = modPaths.filter(() => random() < 0.5);
  const chosenConfigs = configPaths.filter(() => random() < 0.5);

  return [...(chosenMods.length === 0 ? [modPaths[0] as string] : chosenMods), ...chosenConfigs];
};

const installedPath = (path: string): string =>
  path.startsWith('config/') ? path.slice('config/'.length) : path;

const writePlan = async (plan: string[], content: string): Promise<void> => {
  await rm(mods, { recursive: true, force: true });
  await rm(config, { recursive: true, force: true });
  await mkdir(mods, { recursive: true });
  await mkdir(config, { recursive: true });

  for (const path of plan) {
    const [top, ...rest] = path.split('/');

    if (top === undefined) {
      continue;
    }

    const folder = top === 'mods' ? mods : config;
    const relative = rest.join('/');

    await writeAt(join(folder, relative), `${content} ${path}\n`);
  }
};

const run = async (pass: boolean): ReturnType<typeof install> => {
  const check = async (): Promise<CheckResult> => ({ passed: pass, output: String(pass) });

  return install({
    home,
    checkout: root,
    inputs: [],
    modsDirectory: mods,
    configDirectory: config,
    check,
  });
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-install-property-'));
  home = join(root, 'herdr-app');
  mods = join(root, 'dist', 'mods');
  config = join(root, 'config');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('install ownership and order', () => {
  test('records exactly the plan of the last successful install across generated plans', async () => {
    const random = seededRandom(20_261_122);

    for (let index = 0; index < 12; index += 1) {
      const firstPlan = choose(random);
      const secondPlan = choose(random);
      const secondPasses = random() < 0.5;

      await writePlan(firstPlan, 'first');

      await run(true);

      const firstRecord = await readRecord(home);
      const firstOwned = firstPlan.map(installedPath).toSorted();

      expect(firstRecord?.files).toEqual(firstOwned);

      await writePlan(secondPlan, 'second');

      const result = await run(secondPasses);
      const record = await readRecord(home);
      const expected = (secondPasses ? secondPlan : firstPlan).map(installedPath);

      expect(record?.files).toEqual(expected.toSorted());
      expect(record?.origin?.completed).toBe(secondPasses);
      expect(record?.origin?.allChecksPassed).toBe(secondPasses);
      expect(result.checks.every((check) => check.passed)).toBe(secondPasses);

      if (secondPasses) {
        for (const path of secondPlan) {
          expect(await readFile(join(home, installedPath(path)), 'utf8')).toContain(
            `second ${path}`,
          );
        }
      }
    }
  });
});
