import { mock, setSystemTime } from 'bun:test';

import type { ExecResult, FolderWatch } from 'herdr';

import { placeOf, repositoryOf, worktreeOf } from '../src/data/gitIdentity.ts';
import type { Heartbeat } from '../src/data/lease.ts';
import { heartbeatIntervalMilliseconds, heartbeatKey, parseHeartbeat } from '../src/data/lease.ts';
import type { Pull } from '../src/data/pulls.ts';
import type { RepositoryPulls, Snapshot, TicketFacts } from '../src/data/snapshot.ts';
import { spaceOf } from './gitSchedulerHarness.ts';
import { herdrFake } from './moduleFakes.ts';
import { answerFrom, branchCountOf } from './pullAnswers.ts';
import { pullFacts } from './pullFacts.ts';

export interface ExecCall {
  command: string;
  args: string[];
  cwd: string;
  on: string | null;
}

export interface WatchFake {
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

export interface Copy {
  beat: () => void;
  tick: () => void;
}

export interface WindowFake {
  active: boolean;
  visible: boolean;
}

export const pullPeriodMilliseconds = 60_000;

export const pushGapMilliseconds = 15_000;

export const sweepMilliseconds = 250;
export const folder = '/code/koja';
const place = placeOf(null, folder);
export const repository = repositoryOf(null, `${folder}/.git`);
export const start = 1_800_000_000_000;

const mainCheckout = (args: string[], cwd: string): ExecResult => {
  if (args.includes('--is-bare-repository')) {
    return { code: 0, stdout: `false\nfalse\n${cwd}/.git\n${cwd}/.git\n`, stderr: '' };
  }

  if (args.includes('--show-toplevel')) {
    return { code: 0, stdout: `${cwd}\n`, stderr: '' };
  }

  if (args[0] === 'symbolic-ref') {
    return { code: 0, stdout: `${dataHost.gitBranch}\n`, stderr: '' };
  }

  return { code: 0, stdout: 'abc1234\n', stderr: '' };
};

const runFake = async (
  command: string,
  args: string[],
  options: { cwd?: string; on?: string | null },
): Promise<ExecResult> => {
  const cwd = options.cwd ?? '';

  dataHost.execCalls.push({ command, args, cwd, on: options.on ?? null });

  if (command === 'git' && args[0] === 'remote') {
    return { code: 0, stdout: 'origin\n', stderr: '' };
  }

  if (command === 'gh' && args[0] === 'api' && args[1] === 'graphql') {
    if (dataHost.ghFailures > 0) {
      dataHost.ghFailures -= 1;

      return { code: 1, stdout: '', stderr: 'offline' };
    }

    const branchCount = branchCountOf(args);

    return { code: 0, stdout: answerFrom(branchCount, dataHost.pullList), stderr: '' };
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
        const facts = dataHost.linearTickets[id];

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

  return mainCheckout(args, cwd);
};

const watchFolderFake = (watched: string): FolderWatch => {
  const settled = Promise.withResolvers<string[]>();

  const watch: WatchFake = { folder: watched, cancelled: false, resolve: settled.resolve };

  dataHost.watches.push(watch);

  return Object.assign(settled.promise, {
    cancel: () => {
      watch.cancelled = true;
      settled.resolve([]);
    },
  });
};

// The fake Herdr module and its state, so a test drives the host the way the app does. Bun fixes a
// mocked module's export names at the first mock.module call, so this mock uses herdrFake.
export class DataHost {
  sharedValues = new Map<string, unknown>();
  execCalls: ExecCall[] = [];
  watches: WatchFake[] = [];
  spaceFolders: string[] = [folder];
  pullList: Pull[] = [];
  gitBranch = 'main';
  linearTickets: Record<string, TicketFacts> = {};
  ghFailures = 0;
  checkingNow = false;
  window: WindowFake = { active: true, visible: true };
  intervals: number[] = [];
  startDataHost: ((cx: unknown) => void) | null = null;

  reset(): void {
    this.sharedValues.clear();
    this.execCalls = [];
    this.watches = [];
    this.spaceFolders = [folder];
    this.pullList = [];
    this.gitBranch = 'main';
    this.linearTickets = {};
    this.ghFailures = 0;
    this.checkingNow = false;
    this.window = { active: true, visible: true };
    this.intervals = [];
    setSystemTime(start);
  }

  startCopy(): Copy {
    const handlers = new Map<number, (() => void)[]>();

    const context: HostContext = {
      notify: (): void => undefined,
      spawn: (body) => {
        body(context).catch(() => undefined);
      },
      timer: {
        every: (milliseconds, handler) => {
          this.intervals.push(milliseconds);

          const list = handlers.get(milliseconds) ?? [];

          list.push(() => {
            handler(context);
          });

          handlers.set(milliseconds, list);
        },
      },
    };

    if (this.startDataHost === null) {
      throw new TypeError('setupDataHost must run before startCopy');
    }

    this.startDataHost(context);

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
  }

  async settle(): Promise<void> {
    for (let index = 0; index < 30; index += 1) {
      await Promise.resolve();
    }
  }

  gitCalls(): ExecCall[] {
    return this.execCalls.filter((call) => call.command === 'git');
  }

  pullCalls(): ExecCall[] {
    return this.execCalls.filter((call) => call.command === 'gh');
  }

  heartbeat(): Heartbeat | null {
    return parseHeartbeat(this.sharedValues.get(heartbeatKey));
  }

  storedSnapshot(pulls: Record<string, RepositoryPulls> = {}): Snapshot {
    const worktree = worktreeOf(null, folder);

    return {
      version: 8,
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
  }

  readPull(number: number): Pull {
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
  }
}

export const dataHost = new DataHost();

export const setupDataHost = async (): Promise<DataHost> => {
  await mock.module('herdr', () =>
    herdrFake({
      checking: () => dataHost.checkingNow,
      exec: runFake,
      machines: () => [],
      panes: () => [],
      setShared: (key: string, value: unknown) => {
        dataHost.sharedValues.set(key, structuredClone(value));

        return null;
      },
      shared: (key: string) => dataHost.sharedValues.get(key),
      spaces: () =>
        dataHost.spaceFolders.map((spaceFolder, index) => spaceOf(`s${index + 1}`, spaceFolder)),
      readTextFile: async () => null,
      watchFolder: watchFolderFake,
      window: () => ({
        platform: 'linux' as const,
        titlebar: 'none' as const,
        buttons: false,
        maximized: false,
        fullscreen: false,
        active: dataHost.window.active,
        visible: dataHost.window.visible,
      }),
    }),
  );

  const loaded = (await import('../src/data/host.ts')) as {
    startDataHost: (cx: unknown) => void;
  };

  dataHost.startDataHost = loaded.startDataHost;
  dataHost.reset();

  return dataHost;
};
