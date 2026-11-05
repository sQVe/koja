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

let nextRead: () => Promise<ExecResultFake> = async () => ({ code: 0, stdout: '[]' });

await mock.module('herdr', () =>
  herdrFake({
    exec: async (
      _command: string,
      _args: string[],
      _options: { cwd?: string; on?: string | null },
    ) => nextRead(),
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
    expect(tracker.errorLine(git)).toBe('Could not read koja PRs. Last read 6m ago.');
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
});
