import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { replaceOnce } from './scriptCopy.ts';

const checkout = resolve(import.meta.dir, '..');
const sandbox = join(checkout, 'scripts', 'sandbox');

let guards: string;
let root: string;
let script: string;

const generationFile = '.koja-generation';

const environmentFor = (name: string): Record<string, string> => {
  const environment: Record<string, string> = {};

  for (const [key, value] of Object.entries(Bun.env)) {
    if (value !== undefined) {
      environment[key] = value;
    }
  }

  environment['RUTA_NAME'] = name;
  environment['PATH'] = `${guards}:${environment['PATH'] ?? ''}`;

  delete environment['TAU_VERIFICATION_RUN'];
  delete environment['KOJA_SANDBOX_GENERATION'];

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

const writeGeneration = async (folder: string, id: string): Promise<void> => {
  await writeFile(join(folder, generationFile), `${id}\n`);
};

const writeRutaShim = async (folder: string): Promise<void> => {
  const path = join(folder, 'ruta');

  await writeFile(path, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await chmod(path, 0o755);
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
  guards = join(root, 'guards');

  const source = replaceOnce(
    await readFile(sandbox, 'utf8'),
    'root=/var/tmp/ruta-$name',
    `root="${root}/ruta-$name"`,
  );

  // The script reads its checkout as the parent of its own folder, so it sits in a scripts folder
  // beside the stand-in its identity guard runs.
  script = join(root, 'scripts', 'sandbox');

  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(script, source, { mode: 0o755 });
  await chmod(script, 0o755);
  await mkdir(guards, { recursive: true });
  await writeFile(join(root, 'scripts', 'sandboxIdentity.ts'), 'process.exitCode = 0;\n');

  const alphaRoot = join(root, 'ruta-alpha');
  const betaRoot = join(root, 'ruta-beta');

  await mkdir(alphaRoot, { recursive: true });
  await mkdir(betaRoot, { recursive: true });
  await writeGeneration(alphaRoot, 'alpha-generation');
  await writeGeneration(betaRoot, 'beta-generation');
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

  test('up writes the generation id that a later lock checks', async () => {
    const alphaRoot = join(root, 'ruta-alpha');

    await writeRutaShim(guards);
    await rm(join(alphaRoot, generationFile));

    const up = Bun.spawn([script, 'up'], {
      cwd: checkout,
      env: environmentFor('alpha'),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(await up.exited).toBe(0);
    expect((await readFile(join(alphaRoot, generationFile), 'utf8')).trim()).not.toBe('');
  });

  test('rejects a sandbox root whose generation id is missing', async () => {
    await rm(join(root, 'ruta-alpha', generationFile));

    const holder = spawnLock('alpha', ['sh', '-c', 'exit 0']);

    expect(await holder.exited).not.toBe(0);
  });

  test('a waiter that read the old id aborts when the root is replaced under it', async () => {
    const held = join(root, 'held');
    const replace = join(root, 'replace');
    const release = join(root, 'release');
    const second = join(root, 'second');
    const alphaRoot = join(root, 'ruta-alpha');
    let waiter: LockProcess | undefined;

    await writeShim(alphaRoot);

    const first = spawnLock('alpha', [
      'sh',
      '-c',
      `printf held >'${held}'; while [ ! -e '${replace}' ]; do sleep 0.01; done; while [ ! -e '${release}' ]; do sleep 0.01; done`,
    ]);

    try {
      await waitForFile(held);

      waiter = spawnLock('alpha', ['sh', '-c', `printf second >'${second}'`]);

      await Bun.sleep(300);

      expect(waiter.exitCode).toBeNull();

      await rm(alphaRoot, { recursive: true, force: true });
      await mkdir(alphaRoot, { recursive: true });
      await writeGeneration(alphaRoot, 'replacement-generation');
      await writeShim(alphaRoot);
      await writeFile(replace, '');
      await writeFile(release, '');

      expect(await first.exited).toBe(0);
      expect(await waiter.exited).not.toBe(0);
      expect(await Bun.file(second).exists()).toBe(false);
    } finally {
      await writeFile(replace, '').catch(() => undefined);
      await writeFile(release, '').catch(() => undefined);
      await first.exited.catch(() => undefined);
      await stopIfRunning(waiter);
    }
  });

  test('keeps the same-name lock and rejects a replaced root with reused metadata', async () => {
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
      await writeGeneration(alphaRoot, 'replacement-generation');
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
