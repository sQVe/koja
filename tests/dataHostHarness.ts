import { mock, setSystemTime } from 'bun:test';

import type { ExecResult, FolderWatch } from 'herdr';

import { placeOf, repositoryOf, worktreeOf } from '../src/data/gitIdentity.ts';
import type { Heartbeat } from '../src/data/lease.ts';
import { heartbeatIntervalMilliseconds, heartbeatKey, parseHeartbeat } from '../src/data/lease.ts';
import { pushGapMilliseconds, readPeriodMilliseconds } from '../src/data/pullDue.ts';
import type { Pull } from '../src/data/pulls.ts';
import type { RepositoryPulls, Snapshot, TicketFacts } from '../src/data/snapshot.ts';
import { snapshotVersion } from '../src/data/snapshot.ts';
import { spaceOf } from './gitSchedulerHarness.ts';
import { herdrFake } from './moduleFakes.ts';
import { answerFrom, branchCountOf } from './pullAnswers.ts';
import { pullFacts } from './pullFacts.ts';

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

interface WindowFake {
  active: boolean;
  visible: boolean;
}

interface HostState {
  sharedValues: Map<string, unknown>;
  execCalls: ExecCall[];
  watches: WatchFake[];
  spaceFolders: string[];
  pullList: Pull[];
  gitBranch: string;
  linearTickets: Record<string, TicketFacts>;
  ghFailures: number;
  checkingNow: boolean;
  window: WindowFake | null;
  intervals: number[];
}

interface HostControls {
  reset: () => void;
  startCopy: () => Copy;
  settle: () => Promise<void>;
  gitCalls: () => ExecCall[];
  pullCalls: () => ExecCall[];
  heartbeat: () => Heartbeat | null;
  storedSnapshot: (pulls?: Record<string, RepositoryPulls>) => Snapshot;
  readPull: (number: number) => Pull;
  sweepMilliseconds: number;
}

export type DataHostHarness = HostState & HostControls;

export { pushGapMilliseconds };

export const pullPeriodMilliseconds = readPeriodMilliseconds;

export const folder = '/code/koja';
const place = placeOf(null, folder);
export const repository = repositoryOf(null, `${folder}/.git`);
export const start = 1_800_000_000_000;

const mainCheckout = (state: HostState, args: string[], cwd: string): ExecResult => {
  if (args.includes('--is-bare-repository')) {
    return { code: 0, stdout: `false\nfalse\n${cwd}/.git\n${cwd}/.git\n`, stderr: '' };
  }

  if (args.includes('--show-toplevel')) {
    return { code: 0, stdout: `${cwd}\n`, stderr: '' };
  }

  if (args[0] === 'symbolic-ref') {
    return { code: 0, stdout: `${state.gitBranch}\n`, stderr: '' };
  }

  return { code: 0, stdout: 'abc1234\n', stderr: '' };
};

const runFake = async (
  state: HostState,
  command: string,
  args: string[],
  options: { cwd?: string; on?: string | null },
): Promise<ExecResult> => {
  const cwd = options.cwd ?? '';

  state.execCalls.push({ command, args, cwd, on: options.on ?? null });

  if (command === 'git' && args[0] === 'remote') {
    return { code: 0, stdout: 'origin\n', stderr: '' };
  }

  if (command === 'gh' && args[0] === 'api' && args[1] === 'graphql') {
    if (state.ghFailures > 0) {
      state.ghFailures -= 1;

      return { code: 1, stdout: '', stderr: 'offline' };
    }

    const branchCount = branchCountOf(args);

    return { code: 0, stdout: answerFrom(branchCount, state.pullList), stderr: '' };
  }

  if (command === 'cat' && args.at(-1)?.endsWith('.linear.toml') === true) {
    return { code: 0, stdout: 'workspace = "sqve"\n', stderr: '' };
  }

  if (command === 'linear' && args[0] === 'api') {
    const ids = args
      .filter((argument) => /^id\d+=/.test(argument))
      .map((argument) => argument.slice(argument.indexOf('=') + 1));

    const data = Object.fromEntries(
      ids.map((id, index) => {
        const facts = state.linearTickets[id];

        if (facts === undefined) {
          return [`ticket${index}`, undefined];
        }

        const parent = facts.parent === null ? null : { identifier: facts.parent };

        const node = {
          identifier: facts.id,
          title: facts.title,
          state: { name: facts.state },
          url: facts.url,
          parent,
        };

        return [`ticket${index}`, node];
      }),
    );

    return { code: 0, stdout: JSON.stringify({ data }), stderr: '' };
  }

  return mainCheckout(state, args, cwd);
};

const watchFolderFake = (state: HostState, watched: string): FolderWatch => {
  const settled = Promise.withResolvers<string[]>();

  const watch: WatchFake = { folder: watched, cancelled: false, resolve: settled.resolve };

  state.watches.push(watch);

  return Object.assign(settled.promise, {
    cancel: () => {
      watch.cancelled = true;
      settled.resolve([]);
    },
  });
};

const createHostState = (): HostState => ({
  sharedValues: new Map(),
  execCalls: [],
  watches: [],
  spaceFolders: [folder],
  pullList: [],
  gitBranch: 'main',
  linearTickets: {},
  ghFailures: 0,
  checkingNow: false,
  window: { active: true, visible: true },
  intervals: [],
});

const resetHostState = (state: HostState): void => {
  Object.assign(state, createHostState());
  setSystemTime(start);
};

const startCopyOf = (
  state: HostState,
  startDataHost: (cx: unknown) => void,
  sweepMilliseconds: number,
): Copy => {
  const handlers = new Map<number, (() => void)[]>();

  const context: HostContext = {
    notify: (): void => undefined,
    spawn: (body) => {
      body(context).catch(() => undefined);
    },
    timer: {
      every: (milliseconds, handler) => {
        state.intervals.push(milliseconds);

        const list = handlers.get(milliseconds) ?? [];

        list.push(() => {
          handler(context);
        });

        handlers.set(milliseconds, list);
      },
    },
  };

  startDataHost(context);

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

const storedSnapshotOf = (pulls: Record<string, RepositoryPulls> = {}): Snapshot => {
  const worktree = worktreeOf(null, folder);

  return {
    version: snapshotVersion,
    revision: 7,
    facts: {
      git: {
        places: { [place.key]: { kind: 'repository', worktree: worktree.key } },
        worktrees: {
          [worktree.key]: {
            repository,
            root: folder,
            branch: 'main',
            linked: false,
            bare: false,
          },
        },
      },
      pulls,
      trackers: {},
      stacks: {},
    },
  };
};

const readPullOf = (number: number): Pull => {
  return pullFacts({
    number,
    headRefName: `feature-${number}`,
    title: `Pull ${number}`,
    mergeable: 'mergeable',
    mergeState: 'clean',
    review: 'approved',
    checks: { kind: 'read', value: 'passing' },
    threads: { kind: 'read', value: { unresolved: 0, complete: true } },
  });
};

const controlsOf = (
  state: HostState,
  startDataHost: (cx: unknown) => void,
  sweepMilliseconds: number,
): HostControls => ({
  reset: () => {
    resetHostState(state);
  },
  startCopy: () => startCopyOf(state, startDataHost, sweepMilliseconds),
  settle: async () => {
    for (let index = 0; index < 30; index += 1) {
      await Promise.resolve();
    }
  },
  gitCalls: () => state.execCalls.filter((call) => call.command === 'git'),
  pullCalls: () => state.execCalls.filter((call) => call.command === 'gh'),
  heartbeat: () => parseHeartbeat(state.sharedValues.get(heartbeatKey)),
  storedSnapshot: (pulls) => storedSnapshotOf(pulls),
  readPull: (number) => readPullOf(number),
  sweepMilliseconds,
});

// Bun keeps one module registry per worker, so every test file shares this state and the cached host.
const state = createHostState();

// The fake Herdr module and its state, so a test drives the host the way the app does. Bun fixes a
// mocked module's export names at the first mock.module call, so this mock uses herdrFake.
export const setupDataHost = async (): Promise<DataHostHarness> => {
  await mock.module('herdr', () =>
    herdrFake({
      checking: () => state.checkingNow,
      exec: (command: string, args: string[], options: { cwd?: string; on?: string | null }) =>
        runFake(state, command, args, options),
      machines: () => [],
      panes: () => [],
      setShared: (key: string, value: unknown) => {
        state.sharedValues.set(key, structuredClone(value));

        return null;
      },
      shared: (key: string) => state.sharedValues.get(key),
      spaces: () =>
        state.spaceFolders.map((spaceFolder, index) => spaceOf(`s${index + 1}`, spaceFolder)),
      readTextFile: async () => null,
      watchFolder: (watched: string) => watchFolderFake(state, watched),
      window: () =>
        state.window === null
          ? null
          : {
              platform: 'linux' as const,
              titlebar: 'none' as const,
              buttons: false,
              maximized: false,
              fullscreen: false,
              active: state.window.active,
              visible: state.window.visible,
            },
    }),
  );

  const loaded = (await import('../src/data/host.ts')) as {
    startDataHost: (cx: unknown) => void;
    sweepMilliseconds: number;
  };

  return Object.assign(state, controlsOf(state, loaded.startDataHost, loaded.sweepMilliseconds));
};
