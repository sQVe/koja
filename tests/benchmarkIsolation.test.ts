import { afterEach, expect, it } from 'bun:test';
import { lstat, mkdir, mkdtemp, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resourceReport, runScopePath } from '../scripts/benchmarkResources.ts';
import { isolatedEnvironment } from '../scripts/benchmarkServer.ts';

const setVariables = ['KOJA_SOCKET_PATH', 'KOJA_BENCH_TEST', 'BENCH_ISOLATION_KEEP'];

const userRuntimeDirectory = process.env.XDG_RUNTIME_DIR;

afterEach(() => {
  for (const name of setVariables) {
    Reflect.deleteProperty(process.env, name);
  }

  if (userRuntimeDirectory === undefined) {
    Reflect.deleteProperty(process.env, 'XDG_RUNTIME_DIR');
  } else {
    process.env.XDG_RUNTIME_DIR = userRuntimeDirectory;
  }
});

it('drops every KOJA_ variable and keeps the rest of the user environment', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'koja-bench-isolation-'));

  try {
    Object.assign(process.env, {
      KOJA_SOCKET_PATH: '/tmp/outer.sock',
      KOJA_BENCH_TEST: 'outer',
      BENCH_ISOLATION_KEEP: 'kept',
    });

    const environment = isolatedEnvironment(folder);

    expect(Object.keys(environment).filter((name) => name.startsWith('KOJA_'))).toEqual([]);
    expect(environment.BENCH_ISOLATION_KEEP).toBe('kept');
    expect(environment.XDG_STATE_HOME).toBe(join(folder, 'state'));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

const cgroupOf = (scope: string): string => `0::/user.slice/user-1000.slice/app.slice/${scope}\n`;

it('counts a pane scope only when this run server owns it', () => {
  const ownScope = 'koja-pane-123-0b6f.scope';

  expect(runScopePath(cgroupOf(ownScope), 123)).toBe(
    `/user.slice/user-1000.slice/app.slice/${ownScope}`,
  );

  expect(runScopePath(cgroupOf('koja-pane-1234-0b6f.scope'), 123)).toBeUndefined();
  expect(runScopePath(cgroupOf('koja-pane-456-0b6f.scope'), 123)).toBeUndefined();
  expect(runScopePath(cgroupOf('session-2.scope'), 123)).toBeUndefined();
  expect(runScopePath('', 123)).toBeUndefined();
});

const exists = async (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false,
  );

it('links only the systemd manager socket of the user runtime folder into the run folder', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-bench-runtime-'));
  const userRuntime = join(directory, 'user-runtime');
  const managerSocket = join(userRuntime, 'systemd', 'private');

  try {
    await mkdir(join(userRuntime, 'systemd'), { recursive: true });
    await writeFile(managerSocket, '');
    process.env.XDG_RUNTIME_DIR = userRuntime;

    const environment = isolatedEnvironment(join(directory, 'with-manager'));

    expect(environment.XDG_RUNTIME_DIR).toBe(join(directory, 'with-manager', 'runtime'));

    expect(await readlink(join(directory, 'with-manager', 'runtime', 'systemd', 'private'))).toBe(
      managerSocket,
    );

    process.env.XDG_RUNTIME_DIR = join(directory, 'no-manager-runtime');
    isolatedEnvironment(join(directory, 'without-manager'));

    expect(await exists(join(directory, 'without-manager', 'runtime', 'systemd'))).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const snapshot = { ticks: 10, rssKb: 2000, highWaterKb: 2500 };

const tracking = { start: snapshot, last: { ...snapshot, rssKb: 2200 }, peakRssKb: 2500 };

const guestTracking = { usageUsec: 1000, lastUsec: 4000, lastBytes: 4096, peakBytes: 8192 };

it('reports every resource it could read and records no gap', () => {
  const report = resourceReport({
    clientProcessId: 1,
    serverProcessId: 2,
    client: tracking,
    server: tracking,
    guests: new Map([['koja-pane-2-a.scope', guestTracking]]),
    guestPeakBytes: 8192,
    guestEndBytes: 4096,
  });

  expect(report.gaps).toEqual([]);
  expect(report.client?.rssKb).toEqual({ start: 2000, end: 2200, peak: 2500 });
  expect(report.server?.rssKb).toEqual({ start: 2000, end: 2200, peak: 2500 });

  expect(report.guests).toEqual({
    scopes: ['koja-pane-2-a.scope'],
    cpuMs: 3,
    memoryBytes: { lifetimePeak: 8192, end: 4096 },
  });
});

it('leaves out each unreadable resource and names it in a gap', () => {
  const report = resourceReport({
    clientProcessId: 1,
    serverProcessId: 2,
    client: undefined,
    server: undefined,
    guests: new Map(),
    guestPeakBytes: 0,
    guestEndBytes: 0,
  });

  expect(report.client).toBeUndefined();
  expect(report.server).toBeUndefined();
  expect(report.guests).toBeUndefined();
  expect(report.gaps.map((gap) => gap.metric)).toEqual(['client', 'server', 'guests']);
});
