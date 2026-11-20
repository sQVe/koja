import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import type { ExecResult, FolderWatch } from 'herdr';

import { spaceOf } from '../../tests/gitSchedulerHarness.ts';
import { herdrFake } from '../../tests/moduleFakes.ts';
import { runSnapshotNoticeScenario } from '../../tests/snapshotNoticeLifetime.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { Heartbeat } from './lease.ts';
import {
  heartbeatIntervalMilliseconds,
  heartbeatKey,
  leaseExpiryMilliseconds,
  leaseKey,
  parseHeartbeat,
} from './lease.ts';
import type { Snapshot } from './snapshot.ts';
import { emptyFacts, parseSnapshot, snapshotKey } from './snapshot.ts';

interface ExecCall {
  command: string;
  args: string[];
  cwd: string;
  on: string | null;
}

interface WatchFake {
  folder: string;
  cancelled: boolean;
  resolve: (paths: string[]) => void;
}

interface HostContext {
  notify: () => void;
  spawn: (body: (cx: HostContext) => Promise<void>) => void;
  timer: {
    every: (milliseconds: number, handler: (cx: HostContext) => void) => void;
  };
}

interface Copy {
  beat: () => void;
  tick: () => void;
}

const sweepMilliseconds = 250;
const folder = '/code/koja';
const place = placeOf(null, folder);
const repository = repositoryOf(null, `${folder}/.git`);

const sharedValues = new Map<string, unknown>();

let execCalls: ExecCall[] = [];
let watches: WatchFake[] = [];
let spaceFolders: string[] = [folder];
let checkingNow = false;
let intervals: number[] = [];

const mainCheckout = (args: string[], cwd: string): ExecResult => {
  if (args.includes('--is-bare-repository')) {
    return { code: 0, stdout: `false\nfalse\n${cwd}/.git\n${cwd}/.git\n`, stderr: '' };
  }

  if (args.includes('--show-toplevel')) {
    return { code: 0, stdout: `${cwd}\n`, stderr: '' };
  }

  if (args[0] === 'symbolic-ref') {
    return { code: 0, stdout: 'main\n', stderr: '' };
  }

  return { code: 0, stdout: 'abc1234\n', stderr: '' };
};

const runFake = async (
  command: string,
  args: string[],
  options: { cwd?: string; on?: string | null },
): Promise<ExecResult> => {
  const cwd = options.cwd ?? '';

  execCalls.push({ command, args, cwd, on: options.on ?? null });

  return mainCheckout(args, cwd);
};

const watchFolderFake = (watched: string): FolderWatch => {
  const settled = Promise.withResolvers<string[]>();

  const watch: WatchFake = { folder: watched, cancelled: false, resolve: settled.resolve };

  watches.push(watch);

  return Object.assign(settled.promise, {
    cancel: () => {
      watch.cancelled = true;
      settled.resolve([]);
    },
  });
};

await mock.module('herdr', () =>
  herdrFake({
    checking: () => checkingNow,
    exec: runFake,
    machines: () => [],
    panes: () => [],
    setShared: (key: string, value: unknown) => {
      sharedValues.set(key, structuredClone(value));

      return null;
    },
    shared: (key: string) => sharedValues.get(key),
    spaces: () => spaceFolders.map((spaceFolder, index) => spaceOf(`s${index + 1}`, spaceFolder)),
    watchFolder: watchFolderFake,
  }),
);

const modulePath = './host.ts';

const loaded = (await import(modulePath)) as { startDataHost: (cx: unknown) => void };

afterAll(() => {
  mock.restore();
  setSystemTime();
});

const start = 1_800_000_000_000;

const startCopy = (): Copy => {
  const handlers = new Map<number, (() => void)[]>();

  const context: HostContext = {
    notify: (): void => undefined,
    spawn: (body) => {
      body(context).catch(() => undefined);
    },
    timer: {
      every: (milliseconds, handler) => {
        intervals.push(milliseconds);

        const list = handlers.get(milliseconds) ?? [];

        list.push(() => {
          handler(context);
        });

        handlers.set(milliseconds, list);
      },
    },
  };

  loaded.startDataHost(context);

  const fire = (period: number): void => {
    for (const handler of handlers.get(period) ?? []) {
      handler();
    }
  };

  return {
    beat: () => {
      fire(heartbeatIntervalMilliseconds);
    },
    tick: () => {
      fire(sweepMilliseconds);
    },
  };
};

const settle = async (): Promise<void> => {
  for (let index = 0; index < 30; index += 1) {
    await Promise.resolve();
  }
};

const gitCalls = (): ExecCall[] => execCalls.filter((call) => call.command === 'git');

const heartbeat = (): Heartbeat | null => parseHeartbeat(sharedValues.get(heartbeatKey));

const storedSnapshot = (): Snapshot => {
  const worktree = worktreeOf(null, folder);

  return {
    version: 2,
    revision: 7,
    facts: {
      git: {
        places: { [place.key]: { kind: 'repository', worktree: worktree.key } },
        worktrees: {
          [worktree.key]: { repository, root: folder, branch: 'main', linked: false },
        },
      },
    },
  };
};

beforeEach(() => {
  sharedValues.clear();
  execCalls = [];
  watches = [];
  spaceFolders = [folder];
  checkingNow = false;
  intervals = [];
  setSystemTime(start);
});

describe('startDataHost', () => {
  test('claims generation 1 and publishes revision 1 of the empty snapshot at once', () => {
    startCopy();

    expect(heartbeat()).toMatchObject({ generation: 1, at: start });

    expect(sharedValues.get(snapshotKey)).toEqual({
      version: 2,
      revision: 1,
      facts: emptyFacts(),
    });
  });

  test('renews the heartbeat on its timer every heartbeat interval', () => {
    const copy = startCopy();
    const renewedAt = start + heartbeatIntervalMilliseconds;

    setSystemTime(renewedAt);
    copy.beat();

    expect(intervals).toEqual([heartbeatIntervalMilliseconds, sweepMilliseconds]);
    expect(heartbeat()).toMatchObject({ generation: 1, at: renewedAt });
  });

  test('gives each copy its own owner', () => {
    startCopy();
    const first = heartbeat()?.owner;

    sharedValues.clear();
    startCopy();

    expect(heartbeat()?.owner).not.toBe(first);
  });

  test('leaves a live owner in place when a second copy starts', () => {
    startCopy();
    const first = heartbeat();

    setSystemTime(start + heartbeatIntervalMilliseconds);
    startCopy();

    expect(heartbeat()).toEqual(first);
  });

  test('lets a second copy take over with the next generation after the first stops renewing', () => {
    startCopy();
    const first = heartbeat()?.owner;
    const second = startCopy();
    const expiry = start + leaseExpiryMilliseconds;

    setSystemTime(expiry - 1);
    second.beat();

    expect(heartbeat()?.owner).toBe(first);

    setSystemTime(expiry);
    second.beat();

    expect(heartbeat()).toMatchObject({ generation: 2, at: expiry });
    expect(heartbeat()?.owner).not.toBe(first);
  });

  test('stops renewing in a copy whose lease was taken over', () => {
    const first = startCopy();
    const second = startCopy();
    const expiry = start + leaseExpiryMilliseconds;

    setSystemTime(expiry);
    second.beat();
    const taken = heartbeat();

    setSystemTime(expiry + 1);
    first.beat();

    expect(heartbeat()).toEqual(taken);
  });

  test('starts no git read in a copy that does not hold the lease', () => {
    sharedValues.set(leaseKey, { version: 1, owner: 'other', generation: 1 });
    sharedValues.set(heartbeatKey, { version: 1, owner: 'other', generation: 1, at: start });

    const copy = startCopy();

    for (let index = 0; index < 20; index += 1) {
      copy.tick();
    }

    expect(gitCalls()).toEqual([]);
  });

  test('reads git in the copy that holds the lease', async () => {
    const copy = startCopy();

    copy.beat();
    copy.tick();
    await settle();

    const read = gitCalls().some((call) => call.args[0] === 'rev-parse' && call.cwd === folder);

    expect(read).toBe(true);
  });

  test('starts from the stored facts when it takes over', () => {
    sharedValues.set(snapshotKey, storedSnapshot());
    sharedValues.set(leaseKey, { version: 1, owner: 'other', generation: 1 });

    sharedValues.set(heartbeatKey, {
      version: 1,
      owner: 'other',
      generation: 1,
      at: start - leaseExpiryMilliseconds,
    });

    const copy = startCopy();

    copy.beat();

    expect(parseSnapshot(sharedValues.get(snapshotKey))?.revision).toBe(7);
  });

  test('stops reading after it loses the lease', async () => {
    const copy = startCopy();

    copy.tick();
    await settle();

    const before = gitCalls().length;

    expect(before).toBeGreaterThan(0);
    expect(watches).toHaveLength(1);

    sharedValues.set(leaseKey, { version: 1, owner: 'other', generation: 2 });
    sharedValues.set(heartbeatKey, { version: 1, owner: 'other', generation: 2, at: start });
    spaceFolders = [folder, '/code/tikk'];

    for (let index = 0; index < 20; index += 1) {
      copy.tick();
    }

    expect(gitCalls()).toHaveLength(before);
    expect(watches.at(-1)?.cancelled).toBe(true);
  });

  test('starts no git read while Herdr checks the mods', () => {
    checkingNow = true;

    const copy = startCopy();

    for (let index = 0; index < 20; index += 1) {
      copy.tick();
    }

    expect(intervals).toEqual([heartbeatIntervalMilliseconds]);
    expect(gitCalls()).toEqual([]);
  });

  test('logs one notice per reason across the reader, the host seed and the publisher', async () => {
    const record = await runSnapshotNoticeScenario('host-once-per-reason');
    const snapshotWrites = record.writes.filter((write) => write.key === snapshotKey);

    expect(record.messages).toHaveLength(2);
    expect(record.stages.map((stage) => stage.messageCount)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(snapshotWrites).toHaveLength(2);
    expect(snapshotWrites.map((write) => write.messageCount)).toEqual([1, 2]);
    expect(record.snapshot).toEqual({ version: 2, revision: 1, facts: emptyFacts() });
  });

  test('logs again in a fresh loaded copy', async () => {
    const first = await runSnapshotNoticeScenario('host-once-per-reason');
    const second = await runSnapshotNoticeScenario('host-once-per-reason');

    expect(first.messages).toHaveLength(2);
    expect(second.messages).toHaveLength(2);
    expect(second.stages.map((stage) => stage.messageCount)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});
