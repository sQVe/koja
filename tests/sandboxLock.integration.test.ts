import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { replaceOnce } from './scriptCopy.ts';

const checkout = resolve(import.meta.dir, '..');
const sandbox = join(checkout, 'scripts', 'sandbox');

let root: string;
let script: string;

const environmentFor = (name: string): Record<string, string> => {
  const environment: Record<string, string> = {};

  for (const [key, value] of Object.entries(Bun.env)) {
    if (value !== undefined) {
      environment[key] = value;
    }
  }

  environment['RUTA_NAME'] = name;

  delete environment['TAU_VERIFICATION_RUN'];

  return environment;
};

const spawnLock = (name: string, command: string[]) =>
  Bun.spawn([script, 'lock', ...command], {
    cwd: checkout,
    env: environmentFor(name),
    stdout: 'pipe',
    stderr: 'pipe',
  });

type LockProcess = ReturnType<typeof spawnLock>;

const waitForFile = async (path: string): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await Bun.file(path).exists()) {
      return;
    }

    await Bun.sleep(10);
  }

  throw new Error(`The file ${path} never appeared.`);
};

const writeShim = async (folder: string): Promise<void> => {
  const bin = join(folder, 'bin');

  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'herdr-app'), '#!/bin/sh\n', { mode: 0o755 });
  await chmod(join(bin, 'herdr-app'), 0o755);
};

const stopIfRunning = async (child: LockProcess | undefined): Promise<void> => {
  if (child === undefined || child.exitCode !== null) {
    return;
  }

  child.kill();
  await child.exited.catch(() => undefined);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'koja-sandbox-lock-'));

  const source = replaceOnce(
    await readFile(sandbox, 'utf8'),
    'root=/var/tmp/ruta-$name',
    `root="${root}/ruta-$name"`,
  );

  script = join(root, 'sandbox');

  await writeFile(script, source, { mode: 0o755 });
  await chmod(script, 0o755);
  await mkdir(join(root, 'ruta-alpha'), { recursive: true });
  await mkdir(join(root, 'ruta-beta'), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('scripts/sandbox lock', () => {
  test('returns the holder command exit code', async () => {
    const holder = spawnLock('alpha', ['sh', '-c', 'exit 7']);

    expect(await holder.exited).toBe(7);
  });

  test('blocks a second holder for the same sandbox name until release, and not for another name', async () => {
    const held = join(root, 'held');
    const release = join(root, 'release');
    const second = join(root, 'second');
    let same: LockProcess | undefined;
    let other: LockProcess | undefined;

    const first = spawnLock('alpha', [
      'sh',
      '-c',
      `printf held >'${held}'; while [ ! -e '${release}' ]; do sleep 0.01; done`,
    ]);

    try {
      await waitForFile(held);

      same = spawnLock('alpha', ['sh', '-c', `printf second >'${second}'`]);
      other = spawnLock('beta', ['sh', '-c', 'printf other']);

      const otherOutput = await new Response(other.stdout).text();

      expect(await other.exited).toBe(0);
      expect(otherOutput).toBe('other');

      await Bun.sleep(300);

      expect(same.exitCode).toBeNull();
      expect(await Bun.file(second).exists()).toBe(false);

      await writeFile(release, '');

      expect(await first.exited).toBe(0);
      expect(await same.exited).toBe(0);
      expect(await readFile(second, 'utf8')).toBe('second');
    } finally {
      await writeFile(release, '').catch(() => undefined);
      await first.exited.catch(() => undefined);
      await stopIfRunning(same);
      await stopIfRunning(other);
    }
  });

  test('keeps the same-name lock and rejects a sandbox root replaced under it', async () => {
    const held = join(root, 'held');
    const replace = join(root, 'replace');
    const replaced = join(root, 'replaced');
    const release = join(root, 'release');
    const before = join(root, 'before');
    const after = join(root, 'after');
    const second = join(root, 'second');
    const alphaRoot = join(root, 'ruta-alpha');
    let same: LockProcess | undefined;

    await writeShim(alphaRoot);

    const first = spawnLock('alpha', [
      'sh',
      '-c',
      `printf held >'${held}'; if '${script}' guard >/dev/null 2>&1; then printf ok >'${before}'; else printf failed >'${before}'; fi; while [ ! -e '${replace}' ]; do sleep 0.01; done; printf replaced >'${replaced}'; while [ ! -e '${release}' ]; do sleep 0.01; done; if '${script}' guard >/dev/null 2>&1; then printf ok >'${after}'; else printf failed >'${after}'; fi`,
    ]);

    try {
      await waitForFile(held);
      await waitForFile(before);

      expect(await readFile(before, 'utf8')).toBe('ok');

      await rm(alphaRoot, { recursive: true, force: true });
      await mkdir(alphaRoot, { recursive: true });
      await writeShim(alphaRoot);
      await writeFile(replace, '');
      await waitForFile(replaced);

      same = spawnLock('alpha', ['sh', '-c', `printf second >'${second}'`]);

      await Bun.sleep(300);

      expect(same.exitCode).toBeNull();
      expect(await Bun.file(second).exists()).toBe(false);

      await writeFile(release, '');

      expect(await first.exited).toBe(0);
      expect(await readFile(after, 'utf8')).toBe('failed');
      expect(await same.exited).toBe(0);
      expect(await readFile(second, 'utf8')).toBe('second');
    } finally {
      await writeFile(release, '').catch(() => undefined);
      await writeFile(replace, '').catch(() => undefined);
      await first.exited.catch(() => undefined);
      await stopIfRunning(same);
    }
  });
});
