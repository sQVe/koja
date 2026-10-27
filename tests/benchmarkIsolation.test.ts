import { afterEach, expect, it } from 'bun:test';
import { lstat, mkdir, mkdtemp, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  nextGuestTracking,
  nextProcessTracking,
  processSnapshot,
  resourceReport,
  runScopePath,
} from '../scripts/benchmarkResources.ts';
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

const snapshot = { ticks: 10, rssKb: 2000 };

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

it('keeps earlier process samples when a later read fails, and adds readable ones', () => {
  const first = nextProcessTracking(undefined, snapshot);
  const missed = nextProcessTracking(first, undefined);
  const later = nextProcessTracking(missed, { ticks: 30, rssKb: 3000 });

  expect(nextProcessTracking(undefined, undefined)).toBeUndefined();
  expect(missed).toEqual({ start: snapshot, last: snapshot, peakRssKb: 2000 });

  expect(later).toEqual({
    start: snapshot,
    last: { ticks: 30, rssKb: 3000 },
    peakRssKb: 3000,
  });
});

it('keeps earlier guest samples when a later read fails, and adds readable ones', () => {
  const later = { usageUsec: 9000, lastUsec: 9000, lastBytes: 2048, peakBytes: 4096 };

  expect(nextGuestTracking(undefined, undefined)).toBeUndefined();
  expect(nextGuestTracking(undefined, guestTracking)).toEqual(guestTracking);
  expect(nextGuestTracking(guestTracking, undefined)).toEqual(guestTracking);

  expect(nextGuestTracking(guestTracking, later)).toEqual({
    usageUsec: 1000,
    lastUsec: 9000,
    lastBytes: 2048,
    peakBytes: 8192,
  });
});

const statWithTicks = (ticks: number): string =>
  `42 (bun) S 1 42 42 0 -1 4194560 100 0 0 0 ${ticks} 0 0 0 20 0 8 0 100 1000000 500`;

const statusWith = (rssKb: number, highWaterKb: number): string =>
  `Name:\tbun\nVmHWM:\t${highWaterKb} kB\nVmRSS:\t${rssKb} kB\nThreads:\t8\n`;

it('reports the highest RSS sampled in a scenario, not the lifetime high-water mark', () => {
  const earlierScenario = nextProcessTracking(
    undefined,
    processSnapshot(statWithTicks(10), statusWith(9000, 9000)),
  );

  const scenarioStart = nextProcessTracking(
    undefined,
    processSnapshot(statWithTicks(20), statusWith(2000, 9000)),
  );

  const scenarioEnd = nextProcessTracking(
    scenarioStart,
    processSnapshot(statWithTicks(30), statusWith(2500, 9000)),
  );

  expect(earlierScenario?.peakRssKb).toBe(9000);
  expect(scenarioEnd?.peakRssKb).toBe(2500);
  expect(scenarioEnd?.last).toEqual({ ticks: 30, rssKb: 2500 });
});
