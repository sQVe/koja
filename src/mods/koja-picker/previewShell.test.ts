import { describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface FakeHc {
  bin: string;
  log: string;
  pids: string;
}

const script = join(import.meta.dir, 'preview.sh');
const bash = Bun.which('bash') ?? '/bin/bash';

const withTemp = async <T>(body: (root: string) => Promise<T>): Promise<T> => {
  const root = await mkdtemp(join(tmpdir(), 'koja-preview-'));

  try {
    return await body(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

// Every attach records its arguments and pid, then stays alive until serve stops it.
const makeFakeHc = async (root: string): Promise<FakeHc> => {
  const bin = join(root, 'bin');
  const log = join(root, 'hc.log');
  const pids = join(root, 'hc.pids');

  await mkdir(bin);

  await writeFile(
    join(bin, 'hc'),
    `#!/bin/sh\necho $$ >> '${pids}'\necho "$*" >> '${log}'\nexec sleep 300\n`,
  );

  await chmod(join(bin, 'hc'), 0o755);

  return { bin, log, pids };
};

const startServe = (state: string, bin: string, extraEnv: Record<string, string> = {}) =>
  Bun.spawn([bash, script, 'serve', state], {
    env: {
      ...process.env,
      KOJA_PREVIEW_INPUT: '/dev/null',
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      ...extraEnv,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });

const readText = (path: string): Promise<string> => readFile(path, 'utf8').catch(() => '');

const attachCount = async (log: string, target: string): Promise<number> => {
  const text = await readText(log);

  return text.split('\n').filter((line) => line === `attach --observe ${target}`).length;
};

const lastPid = async (pids: string): Promise<number> => {
  const text = await readText(pids);
  const lines = text.split('\n').filter((line) => line !== '');

  return Number(lines[lines.length - 1]);
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

const waitFor = async (ready: () => Promise<boolean>, milliseconds: number): Promise<boolean> => {
  const until = Date.now() + milliseconds;

  while (Date.now() < until) {
    if (await ready()) {
      return true;
    }

    await Bun.sleep(20);
  }

  return ready();
};

describe.concurrent('preview.sh serve', () => {
  test('attaches on a change and not on an unchanged file', async () => {
    await withTemp(async (root) => {
      const state = join(root, 'state');

      await writeFile(state, 'term-1');

      const { bin, log } = await makeFakeHc(root);
      const child = startServe(state, bin);

      try {
        expect(await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000)).toBe(
          true,
        );

        await writeFile(state, 'term-1');
        await Bun.sleep(250);

        expect(await attachCount(log, 'term-1')).toBe(1);

        await writeFile(state, 'term-2');

        expect(await waitFor(async () => (await attachCount(log, 'term-2')) === 1, 2_000)).toBe(
          true,
        );

        expect(await attachCount(log, 'term-1')).toBe(1);
      } finally {
        child.kill();
        await child.exited;
      }
    });
  });

  test('detaches on a dash', async () => {
    await withTemp(async (root) => {
      const state = join(root, 'state');

      await writeFile(state, 'term-1');

      const { bin, log, pids } = await makeFakeHc(root);
      const child = startServe(state, bin);

      try {
        expect(await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000)).toBe(
          true,
        );

        const pid = await lastPid(pids);

        expect(pid).toBeGreaterThan(0);

        await writeFile(state, '-');

        expect(await waitFor(async () => !alive(pid), 2_000)).toBe(true);
      } finally {
        child.kill();
        await child.exited;
      }
    });
  });

  test('stops when the state file goes away', async () => {
    await withTemp(async (root) => {
      const state = join(root, 'state');

      await writeFile(state, 'term-1');

      const { bin, log, pids } = await makeFakeHc(root);
      const child = startServe(state, bin);

      await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000);

      const pid = await lastPid(pids);

      expect(pid).toBeGreaterThan(0);

      await rm(state);

      expect(await child.exited).toBe(0);
      expect(await waitFor(async () => !alive(pid), 2_000)).toBe(true);
    });
  });

  test('TERM ends the viewer and leaves no child process', async () => {
    await withTemp(async (root) => {
      const state = join(root, 'state');

      await writeFile(state, 'term-1');

      const { bin, log, pids } = await makeFakeHc(root);
      const child = startServe(state, bin);

      await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000);

      const pid = await lastPid(pids);

      expect(pid).toBeGreaterThan(0);

      child.kill('SIGTERM');

      expect(await child.exited).toBe(0);
      expect(await waitFor(async () => !alive(pid), 2_000)).toBe(true);
    });
  });

  test('stops when the state folder goes away and leaves no child process', async () => {
    await withTemp(async (root) => {
      const state = join(root, 'state');

      await writeFile(state, 'term-1');

      const { bin, log, pids } = await makeFakeHc(root);
      const child = startServe(state, bin);

      expect(await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000)).toBe(true);

      const pid = await lastPid(pids);

      expect(pid).toBeGreaterThan(0);

      await rm(root, { force: true, recursive: true });

      expect(await child.exited).toBe(0);
      expect(await waitFor(async () => !alive(pid), 2_000)).toBe(true);
    });
  });

  test('stops when the heartbeat never changes, leaving no child process', async () => {
    await withTemp(async (root) => {
      const state = join(root, 'state');
      const heartbeat = join(root, 'heartbeat');

      await writeFile(state, 'term-1');
      await writeFile(heartbeat, 'beat-1');

      const { bin, log, pids } = await makeFakeHc(root);
      const child = startServe(state, bin, { KOJA_PREVIEW_HEARTBEAT_LIMIT_POLLS: '20' });

      expect(await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000)).toBe(true);

      const pid = await lastPid(pids);

      expect(pid).toBeGreaterThan(0);

      expect(await child.exited).toBe(0);
      expect(await waitFor(async () => !alive(pid), 2_000)).toBe(true);
    });
  });

  test('keeps the default limit when the override is not a positive whole number', async () => {
    for (const override of ['0', 'soon', '2.5']) {
      await withTemp(async (root) => {
        const state = join(root, 'state');
        const heartbeat = join(root, 'heartbeat');

        await writeFile(state, 'term-1');
        await writeFile(heartbeat, 'beat-1');

        const { bin, log } = await makeFakeHc(root);
        const child = startServe(state, bin, { KOJA_PREVIEW_HEARTBEAT_LIMIT_POLLS: override });

        expect(await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000)).toBe(
          true,
        );

        await Bun.sleep(500);

        expect(child.exitCode).toBeNull();

        child.kill('SIGTERM');
        await child.exited;
      });
    }
  });

  test('keeps the viewer when the heartbeat writer pauses past the old limit', async () => {
    await withTemp(async (root) => {
      const state = join(root, 'state');
      const heartbeat = join(root, 'heartbeat');

      await writeFile(state, 'term-1');
      await writeFile(heartbeat, 'beat-1');

      const { bin, log, pids } = await makeFakeHc(root);
      const child = startServe(state, bin);

      expect(await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000)).toBe(true);

      const pid = await lastPid(pids);

      // Longer than the old 5 s wall-clock limit, shorter than the 1200-poll (~60 s) limit.
      await Bun.sleep(6_200);
      await writeFile(heartbeat, 'beat-2');

      expect(child.exitCode).toBeNull();
      expect(alive(pid)).toBe(true);
      expect(await attachCount(log, 'term-1')).toBe(1);

      child.kill();
      await child.exited;
    });
  }, 20_000);

  test('does not end when serve itself is suspended past the limit', async () => {
    await withTemp(async (root) => {
      const state = join(root, 'state');
      const heartbeat = join(root, 'heartbeat');

      await writeFile(state, 'term-1');
      await writeFile(heartbeat, 'beat-1');

      const { bin, log, pids } = await makeFakeHc(root);
      const child = startServe(state, bin, { KOJA_PREVIEW_HEARTBEAT_LIMIT_POLLS: '20' });

      try {
        expect(await waitFor(async () => (await attachCount(log, 'term-1')) === 1, 2_000)).toBe(
          true,
        );

        const pid = await lastPid(pids);

        expect(pid).toBeGreaterThan(0);

        process.kill(child.pid, 'SIGSTOP');
        await Bun.sleep(1_500);
        process.kill(child.pid, 'SIGCONT');
        await Bun.sleep(100);

        expect(child.exitCode).toBeNull();
        expect(alive(pid)).toBe(true);
      } finally {
        process.kill(child.pid, 'SIGCONT');
        child.kill();
        await child.exited;
      }
    });
  });
});
