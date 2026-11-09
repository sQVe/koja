import { afterAll, afterEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { herdrFake } from '../../../tests/moduleFakes.ts';

interface ExecResultFake {
  code: number;
  stdout: string;
}

interface RepoRefLike {
  machine: string | null;
  path: string;
  key: string;
}

interface GitLike {
  branch: string | null;
  repo: RepoRefLike;
  root: string;
  cwd: string;
  linked: boolean;
  committedAt: number | null;
}

interface PullLike {
  number: number;
}

interface PullTrackerLike {
  lookup: (git: GitLike) => PullLike | null;
  errorLine: (git: GitLike) => string | null;
  refresh: (repositories: { repo: RepoRefLike; cwd: string }[], cx: unknown) => void;
  retry: (repo: RepoRefLike, cwd: string, cx: unknown) => void;
}

let nextRemotes: () => Promise<ExecResultFake> = async () => ({ code: 0, stdout: 'origin\n' });
let nextRead: () => Promise<ExecResultFake> = async () => ({ code: 0, stdout: '[]' });
let pullReads = 0;

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

      pullReads += 1;

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

const repo: RepoRefLike = {
  machine: null,
  path: '/code/koja/.git',
  key: JSON.stringify([null, '/code/koja/.git']),
};

const git: GitLike = {
  branch: 'main',
  repo,
  root: '/code/koja',
  cwd: '/code/koja',
  linked: false,
  committedAt: null,
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
  pullReads = 0;
});

describe('PullTracker', () => {
  test('a failed PR read keeps the old numbers and shows an error with their age', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRead = async () => ({ code: 0, stdout: pulled });
    tracker.refresh([{ repo, cwd: repo.path }], context);
    await flush();

    expect(tracker.lookup(git)?.number).toBe(7);

    setSystemTime(new Date('2026-01-01T00:06:00.000Z'));
    nextRead = async () => ({ code: 1, stdout: '' });
    tracker.refresh([{ repo, cwd: repo.path }], context);
    await flush();

    expect(tracker.lookup(git)?.number).toBe(7);
    expect(tracker.errorLine(git)).toBe('koja PRs are 6m old.');
  });

  test('Retry clears the error after a good read', async () => {
    setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRead = async () => {
      throw new Error('gh is away');
    };

    tracker.refresh([{ repo, cwd: repo.path }], context);
    await flush();

    expect(tracker.errorLine(git)).toBe('Could not read koja PRs.');

    nextRead = async () => ({ code: 0, stdout: pulled });
    tracker.retry(repo, repo.path, context);
    await flush();

    expect(tracker.lookup(git)?.number).toBe(7);
    expect(tracker.errorLine(git)).toBeNull();
  });

  test('a repository without a remote has no PRs and no error', async () => {
    setSystemTime(new Date('2026-01-01T02:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRemotes = async () => ({ code: 0, stdout: '' });
    nextRead = async () => ({ code: 1, stdout: '' });
    tracker.refresh([{ repo, cwd: repo.path }], context);
    await flush();

    expect(tracker.errorLine(git)).toBeNull();
    expect(tracker.lookup(git)).toBeNull();
    expect(pullReads).toBe(0);
  });

  test('a failed remote read shows the error line', async () => {
    setSystemTime(new Date('2026-01-01T03:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRemotes = async () => ({ code: 128, stdout: '' });
    nextRead = async () => ({ code: 0, stdout: pulled });
    tracker.refresh([{ repo, cwd: repo.path }], context);
    await flush();

    expect(tracker.errorLine(git)).toBe('Could not read koja PRs.');
  });

  test('a repository with a remote whose PR read fails shows the error line', async () => {
    setSystemTime(new Date('2026-01-01T04:00:00.000Z'));
    const tracker = new loaded.PullTracker();

    nextRead = async () => ({ code: 1, stdout: '' });
    tracker.refresh([{ repo, cwd: repo.path }], context);
    await flush();

    expect(tracker.errorLine(git)).toBe('Could not read koja PRs.');
  });
});
