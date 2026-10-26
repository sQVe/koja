import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { GuestResources, ProcessResources } from './benchmarkResult.ts';

export type ResourceMetric = 'client' | 'server' | 'guests';

export interface ResourceGap {
  metric: ResourceMetric;
  reason: string;
}

export interface ResourceReport {
  client: ProcessResources | undefined;
  server: ProcessResources | undefined;
  guests: GuestResources | undefined;
  gaps: ResourceGap[];
}

export interface ResourceSampler {
  stop: () => ResourceReport;
}

interface ProcessSnapshot {
  ticks: number;
  rssKb: number;
  highWaterKb: number;
}

interface ProcessTracking {
  start: ProcessSnapshot;
  last: ProcessSnapshot;
  peakRssKb: number;
}

interface GuestTracking {
  usageUsec: number;
  lastUsec: number;
  lastBytes: number;
  peakBytes: number;
}

interface TrackedResources {
  clientProcessId: number;
  serverProcessId: number;
  client: ProcessTracking | undefined;
  server: ProcessTracking | undefined;
  guests: Map<string, GuestTracking>;
  guestPeakBytes: number;
  guestEndBytes: number;
}

const sampleIntervalMs = 100;

const defaultClockTicksPerSecond = 100;

const millisecondsPerSecond = 1_000;

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

const readNumber = (path: string): number | undefined => {
  const text = readText(path)?.trim();
  const number = Number(text);

  return text === undefined || text === '' || !Number.isFinite(number) ? undefined : number;
};

const clockTicksPerSecond = (): number => {
  const result = Bun.spawnSync(['getconf', 'CLK_TCK'], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });

  const ticks = Number(new TextDecoder().decode(result.stdout).trim());

  return Number.isInteger(ticks) && ticks > 0 ? ticks : defaultClockTicksPerSecond;
};

const ticksPerSecond = clockTicksPerSecond();

const readProcessTicks = (stat: string): number | undefined => {
  const close = stat.lastIndexOf(')');
  const fields = stat.slice(close + 2).split(' ');
  const userTicks = Number(fields[11] ?? '');
  const systemTicks = Number(fields[12] ?? '');

  return Number.isFinite(userTicks) && Number.isFinite(systemTicks)
    ? userTicks + systemTicks
    : undefined;
};

const readProcessMemory = (status: string): { rssKb: number; highWaterKb: number } | undefined => {
  const rssKb = Number(/^VmRSS:\s+(\d+) kB$/m.exec(status)?.[1] ?? '');
  const highWaterKb = Number(/^VmHWM:\s+(\d+) kB$/m.exec(status)?.[1] ?? '');

  if (!Number.isFinite(rssKb)) {
    return undefined;
  }

  return { rssKb, highWaterKb: Number.isFinite(highWaterKb) ? highWaterKb : rssKb };
};

const readProcessSnapshot = (processId: number): ProcessSnapshot | undefined => {
  const stat = readText(`/proc/${processId}/stat`);
  const status = readText(`/proc/${processId}/status`);

  if (stat === undefined || status === undefined) {
    return undefined;
  }

  const ticks = readProcessTicks(stat);
  const memory = readProcessMemory(status);

  return ticks === undefined || memory === undefined ? undefined : { ticks, ...memory };
};

const processReport = (tracking: ProcessTracking | undefined): ProcessResources | undefined =>
  tracking === undefined
    ? undefined
    : {
        cpuMs:
          ((tracking.last.ticks - tracking.start.ticks) * millisecondsPerSecond) / ticksPerSecond,
        rssKb: {
          start: tracking.start.rssKb,
          end: tracking.last.rssKb,
          peak: tracking.peakRssKb,
        },
      };

const childrenOf = (processId: number): number[] => {
  const text = readText(`/proc/${processId}/task/${processId}/children`) ?? '';

  return text
    .split(' ')
    .map(Number)
    .filter((process) => Number.isInteger(process) && process > 0);
};

export const runScopePath = (cgroup: string, serverProcessId: number): string | undefined => {
  const path = /^0::(.+)$/m.exec(cgroup)?.[1];

  if (path === undefined || !basename(path).startsWith(`koja-pane-${serverProcessId}-`)) {
    return undefined;
  }

  return path;
};

const scopePathOf = (processId: number, serverProcessId: number): string | undefined =>
  runScopePath(readText(`/proc/${processId}/cgroup`) ?? '', serverProcessId);

const readGuestTracking = (path: string): GuestTracking | undefined => {
  const directory = join('/sys/fs/cgroup', path);
  const cpuStat = readText(join(directory, 'cpu.stat'));
  const usageUsec = Number(/^usage_usec\s+(\d+)$/m.exec(cpuStat ?? '')?.[1] ?? '');
  const current = readNumber(join(directory, 'memory.current'));
  const peak = readNumber(join(directory, 'memory.peak')) ?? current;

  if (!Number.isFinite(usageUsec) || current === undefined) {
    return undefined;
  }

  return {
    usageUsec,
    lastUsec: usageUsec,
    lastBytes: current,
    peakBytes: Math.max(current, peak ?? current),
  };
};

const guestScopes = (serverProcessId: number): Map<string, string> => {
  const scopes = new Map<string, string>();

  for (const child of childrenOf(serverProcessId)) {
    const path = scopePathOf(child, serverProcessId);

    if (path !== undefined) {
      scopes.set(basename(path), path);
    }
  }

  return scopes;
};

export const resourceReport = (tracked: TrackedResources): ResourceReport => {
  const { clientProcessId, serverProcessId, guests } = tracked;
  const gaps: ResourceGap[] = [];

  if (tracked.client === undefined) {
    gaps.push({
      metric: 'client',
      reason: `The client process ${clientProcessId} was not readable in /proc.`,
    });
  }

  if (tracked.server === undefined) {
    gaps.push({
      metric: 'server',
      reason: `The server process ${serverProcessId} was not readable in /proc.`,
    });
  }

  if (guests.size === 0) {
    gaps.push({
      metric: 'guests',
      reason: `No koja-pane-${serverProcessId}-*.scope cgroups were found; pane scopes did not start.`,
    });
  }

  return {
    client: processReport(tracked.client),
    server: processReport(tracked.server),
    guests:
      guests.size === 0
        ? undefined
        : {
            scopes: [...guests.keys()].toSorted(),
            cpuMs: [...guests.values()].reduce(
              (total, tracking) =>
                total + (tracking.lastUsec - tracking.usageUsec) / millisecondsPerSecond,
              0,
            ),
            memoryBytes: { lifetimePeak: tracked.guestPeakBytes, end: tracked.guestEndBytes },
          },
    gaps,
  };
};

export const startResourceSampler = (
  clientProcessId: number,
  serverProcessId: number,
): ResourceSampler => {
  let clientTracking: ProcessTracking | undefined;
  let serverTracking: ProcessTracking | undefined;
  const guests = new Map<string, GuestTracking>();
  let guestPeakBytes = 0;
  let guestEndBytes = 0;

  const sampleProcess = (
    tracking: ProcessTracking | undefined,
    processId: number,
  ): ProcessTracking | undefined => {
    const snapshot = readProcessSnapshot(processId);

    if (snapshot === undefined) {
      return tracking;
    }

    if (tracking === undefined) {
      return {
        start: snapshot,
        last: snapshot,
        peakRssKb: Math.max(snapshot.rssKb, snapshot.highWaterKb),
      };
    }

    tracking.last = snapshot;
    tracking.peakRssKb = Math.max(tracking.peakRssKb, snapshot.rssKb, snapshot.highWaterKb);

    return tracking;
  };

  const sampleGuests = (): void => {
    for (const [scope, path] of guestScopes(serverProcessId)) {
      const known = guests.get(scope);
      const current = readGuestTracking(path);

      if (current === undefined) {
        continue;
      }

      if (known === undefined) {
        guests.set(scope, current);
      } else {
        known.lastUsec = current.usageUsec;
        known.lastBytes = current.lastBytes;
        known.peakBytes = Math.max(known.peakBytes, current.peakBytes);
      }
    }

    let endBytes = 0;
    let peakBytes = 0;

    for (const tracking of guests.values()) {
      endBytes += tracking.lastBytes;
      peakBytes += tracking.peakBytes;
    }

    guestEndBytes = endBytes;
    guestPeakBytes = Math.max(guestPeakBytes, endBytes, peakBytes);
  };

  const sample = (): void => {
    clientTracking = sampleProcess(clientTracking, clientProcessId);
    serverTracking = sampleProcess(serverTracking, serverProcessId);
    sampleGuests();
  };

  sample();

  const timer = setInterval(sample, sampleIntervalMs);

  return {
    stop: (): ResourceReport => {
      clearInterval(timer);
      sample();

      return resourceReport({
        clientProcessId,
        serverProcessId,
        client: clientTracking,
        server: serverTracking,
        guests,
        guestPeakBytes,
        guestEndBytes,
      });
    },
  };
};
