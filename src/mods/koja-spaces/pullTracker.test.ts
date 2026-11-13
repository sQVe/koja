import { afterAll, afterEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { herdrFake } from '../../../tests/moduleFakes.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';
import type { RepositoryIdentity } from '../../data/gitIdentity.ts';
import type { Pull } from './pulls.ts';
import type { GitInfo } from './tree.ts';

interface ExecResultFake {
  code: number;
  stdout: string;
}

interface PullTrackerLike {
  lookup: (git: GitInfo) => Pull | null;
  failed: (git: GitInfo) => boolean;
  refresh: (repositories: { repo: RepositoryIdentity; cwd: string }[], cx: unknown) => void;
  retry: (repo: RepositoryIdentity, cwd: string, cx: unknown) => void;
}

let nextRemotes: () => Promise<ExecResultFake> = async () => ({ code: 0, stdout: 'origin\n' });
let nextRead: () => Promise<ExecResultFake> = async () => ({ code: 0, stdout: '[]' });

await mock.module('herdr', () =>
  herdrFake({
    exec: async (
      command: string,
      _args: string[],
      _options: { cwd?: string; on?: string | null },
    ) => {
      if (command === 'git') {
        return nextRemotes();
      }

      return nextRead();
    },
  }),
);

const store = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  },
});

const modulePath = './pullTracker.ts';
const loaded = (await import(modulePath)) as { PullTracker: new () => PullTrackerLike };

const pulled = JSON.stringify([
  { number: 7, state: 'OPEN', isDraft: false, title: 'Fix the redirect', headRefName: 'main' },
]);

const repo = repositoryOf(null, '/code/koja/.git');

const git: GitInfo = {
  branch: 'main',
  repo,
  root: '/code/koja',
  cwd: '/code/koja',
  linked: false,
};

const spawned: Promise<void>[] = [];

const context = {
  spawn: (body: (cx: { notify: () => void }) => Promise<void>) => {
    spawned.push(body({ notify: () => undefined }));
  },
  notify: () => undefined,
};

const flush = async (): Promise<void> => {
  await Promise.all(spawned.splice(0));
};

afterAll(() => {
  setSystemTime();
  mock.restore();
});

afterEach(() => {
  setSystemTime();
  store.clear();
  nextRemotes = async () => ({ code: 0, stdout: 'origin\n' });
});

describe('PullTracker', () => {
  test('a failed PR read keeps the old numbers and reports the failure', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRead = async () => ({ code: 0, stdout: pulled });
    tracker.refresh([{ repo, cwd: repo.commonDirectory }], context);
    await flush();

    expect(tracker.lookup(git)?.number).toBe(7);

    setSystemTime(new Date('2026-01-01T00:06:00.000Z'));
    nextRead = async () => ({ code: 1, stdout: '' });
    tracker.refresh([{ repo, cwd: repo.commonDirectory }], context);
    await flush();

    expect(tracker.lookup(git)?.number).toBe(7);
    expect(tracker.failed(git)).toBe(true);
  });

  test('Retry clears the failure after a good read', async () => {
    setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRead = async () => {
      throw new Error('gh is away');
    };

    tracker.refresh([{ repo, cwd: repo.commonDirectory }], context);
    await flush();

    expect(tracker.failed(git)).toBe(true);

    nextRead = async () => ({ code: 0, stdout: pulled });
    tracker.retry(repo, repo.commonDirectory, context);
    await flush();

    expect(tracker.lookup(git)?.number).toBe(7);
    expect(tracker.failed(git)).toBe(false);
  });

  test('a repository without a remote has no PRs and no failure', async () => {
    setSystemTime(new Date('2026-01-01T02:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRemotes = async () => ({ code: 0, stdout: '' });
    nextRead = async () => ({ code: 1, stdout: '' });
    tracker.refresh([{ repo, cwd: repo.commonDirectory }], context);
    await flush();

    expect(tracker.failed(git)).toBe(false);
    expect(tracker.lookup(git)).toBeNull();
  });

  test('a failed remote read reports the failure', async () => {
    setSystemTime(new Date('2026-01-01T03:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRemotes = async () => ({ code: 128, stdout: '' });
    nextRead = async () => ({ code: 0, stdout: pulled });
    tracker.refresh([{ repo, cwd: repo.commonDirectory }], context);
    await flush();

    expect(tracker.failed(git)).toBe(true);
  });

  test('a repository with a remote whose PR read fails reports the failure', async () => {
    setSystemTime(new Date('2026-01-01T04:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRead = async () => ({ code: 1, stdout: '' });
    tracker.refresh([{ repo, cwd: repo.commonDirectory }], context);
    await flush();

    expect(tracker.failed(git)).toBe(true);
  });
});
