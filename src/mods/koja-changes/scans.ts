import type { AsyncContext, Task } from 'gpui-kit';
import type { ExecResult } from 'herdr';

import type { ReadRequest } from './due.ts';

export interface RepoScan {
  status: ExecResult | null;
  error: unknown;
  started: number;
  watchAt: number;
  pollAt: number;
}

export interface ScanHost {
  now: () => number;
  active: () => boolean;
  status: (root: string, on: string | null) => Promise<ExecResult>;
}

interface ScanTiming {
  started: number | null;
  status: ExecResult | null;
  error: unknown;
  watchAt: number | null;
  pollAt: number | null;
}

interface ScanEntry {
  task: Task;
  timing: ScanTiming;
}

declare global {
  var kojaRepoScans: Map<string, ScanEntry> | undefined;
}

// Two panels of the same folder run in one VM, so they share this table and one scan.
const sharedScans = (): Map<string, ScanEntry> => {
  globalThis.kojaRepoScans ??= new Map<string, ScanEntry>();

  return globalThis.kojaRepoScans;
};

export const clearSharedScans = (): void => {
  sharedScans().clear();
};

// Lets both listeners of one watch batch join before Git starts.
const sleepMilliseconds = 25;

const waitMilliseconds = 50;

const fastScanMilliseconds = 500;

const minimumPollMilliseconds = 10000;

const maximumPollMilliseconds = 60000;

// A slow scan repeats less often: five times its own length, up to a minute.
const slowScanFactor = 5;

const scanKey = (root: string, on: string | null): string => JSON.stringify([on, root]);

const isPending = (scan: ScanEntry): boolean => scan.timing.pollAt === null && !scan.task.is_done();

const reusable = (scan: ScanEntry | null, request: ReadRequest, now: number): boolean => {
  if (scan === null) {
    return false;
  }

  const { status, started, watchAt, pollAt } = scan.timing;

  if (status?.code !== 0 || pollAt === null || now >= pollAt) {
    return false;
  }

  if ((started ?? 0) >= request.after) {
    return true;
  }

  return !request.urgent && now < (watchAt ?? 0);
};

const canStart = (scan: ScanEntry | null, request: ReadRequest): boolean => {
  if (scan === null || !isPending(scan)) {
    return true;
  }

  return request.visiting && scan.timing.started !== null && scan.timing.started < request.after;
};

const prune = (scans: Map<string, ScanEntry>, now: number): void => {
  for (const [key, scan] of scans) {
    const { pollAt } = scan.timing;
    const expired = pollAt !== null && pollAt <= now;
    const abandoned = pollAt === null && scan.task.is_done();

    if (expired || abandoned) {
      scans.delete(key);
    }
  }
};

const finishTiming = (timing: ScanTiming, host: ScanHost): void => {
  const finished = host.now();
  const duration = finished - (timing.started ?? finished);

  const slow = duration >= fastScanMilliseconds;
  const delay = slow ? Math.min(maximumPollMilliseconds, slowScanFactor * duration) : 0;

  timing.watchAt = finished + delay;
  timing.pollAt = finished + Math.max(minimumPollMilliseconds, delay);
};

const startScan = (
  host: ScanHost,
  scans: Map<string, ScanEntry>,
  key: string,
  taskCx: AsyncContext,
  root: string,
  on: string | null,
  request: ReadRequest,
): ScanEntry => {
  const timing: ScanTiming = {
    started: null,
    status: null,
    error: null,
    watchAt: null,
    pollAt: null,
  };

  const task = taskCx.spawn(async (scanCx) => {
    await scanCx.sleep(sleepMilliseconds);

    if (!request.allowInactive && !host.active()) {
      return;
    }

    timing.started = host.now();

    try {
      timing.status = await host.status(root, on);
    } catch (error) {
      timing.error = error;
    } finally {
      finishTiming(timing, host);

      if (timing.status?.code !== 0 && scans.get(key)?.timing === timing) {
        scans.delete(key);
      }
    }
  });

  return { task, timing };
};

const finishedScan = (scan: ScanEntry): RepoScan | null => {
  const { started, status, error, watchAt, pollAt } = scan.timing;

  if (started === null || watchAt === null || pollAt === null) {
    return null;
  }

  return { status, error, started, watchAt, pollAt };
};

const chooseScan = (
  host: ScanHost,
  scans: Map<string, ScanEntry>,
  key: string,
  taskCx: AsyncContext,
  root: string,
  on: string | null,
  request: ReadRequest,
  now: number,
): ScanEntry | null => {
  const existing = scans.get(key) ?? null;

  if (reusable(existing, request, now) || !canStart(existing, request)) {
    return existing;
  }

  if (!request.allowInactive && !host.active()) {
    return null;
  }

  const scan = startScan(host, scans, key, taskCx, root, on, request);

  scans.set(key, scan);

  return scan;
};

// One `git status` per repository: a copy joins the scan another copy runs instead of starting one.
export const repoStatus = async (
  host: ScanHost,
  root: string,
  on: string | null,
  request: ReadRequest,
  taskCx: AsyncContext,
  isCurrent: () => boolean,
): Promise<RepoScan | null> => {
  const scans = sharedScans();
  const key = scanKey(root, on);

  for (;;) {
    prune(scans, host.now());

    if (!isCurrent()) {
      return null;
    }

    const scan = chooseScan(host, scans, key, taskCx, root, on, request, host.now());

    if (scan === null) {
      return null;
    }

    while (isCurrent() && isPending(scan)) {
      // eslint-disable-next-line no-await-in-loop -- the copy that started the scan is what we wait for
      await taskCx.sleep(waitMilliseconds);
    }

    if (!isCurrent()) {
      return null;
    }

    if (scan.timing.pollAt === null) {
      continue;
    }

    return finishedScan(scan);
  }
};
