import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { PullSchedulerHarness, pullSchedulerStart } from '../../tests/pullSchedulerHarness.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import type { PullRetryRequest } from './pullRetry.ts';
import type { GitFacts } from './snapshot.ts';

const folders = ['/code/a', '/code/b', '/code/c'];

const factsOf = (): GitFacts => {
  const places: GitFacts['places'] = {};
  const worktrees: GitFacts['worktrees'] = {};

  for (const folder of folders) {
    const place = placeOf(null, folder);
    const worktree = worktreeOf(null, folder);

    places[place.key] = { kind: 'repository', worktree: worktree.key };

    worktrees[worktree.key] = {
      repository: repositoryOf(null, `${folder}/.git`),
      root: folder,
      branch: 'main',
      linked: false,
    };
  }

  return { places, worktrees };
};

const offline: ExecResult = { code: 1, stdout: '', stderr: 'offline' };

const repositoryAt = (folder: string): string => repositoryOf(null, `${folder}/.git`).key;

const requestFor = (repository: string, at: number): PullRetryRequest => ({
  consumer: 'window-a',
  id: 'r-1',
  repository,
  at,
});

describe('createPullScheduler Retry', () => {
  test('Retry ignores backoff and the cap', async () => {
    const harness = new PullSchedulerHarness();
    const scheduler = harness.start({ pulls: {}, readTimes: {} });
    const git = factsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls.map((call) => call.cwd)).toEqual(['/code/a', '/code/b']);

    await harness.respondRemotesIn('/code/a', 'git@github.com:koja/koja.git');

    const failedRead = harness.callsIn('/code/a')[2];

    if (failedRead === undefined) {
      throw new Error('no pull read in /code/a');
    }

    await harness.respondCall(failedRead, offline);

    harness.setNow(pullSchedulerStart + 60_000);
    scheduler.tick(git, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls.map((call) => call.cwd)).toEqual([
      '/code/a',
      '/code/b',
      '/code/a',
      '/code/a',
      '/code/c',
    ]);

    scheduler.tick(git, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls).toHaveLength(5);

    harness.setRequests([requestFor(repositoryAt('/code/a'), harness.now)]);
    scheduler.tick(git, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.callsIn('/code/a')).toHaveLength(4);
    expect(harness.calls.at(-1)?.cwd).toBe('/code/a');
  });
});
