import { describe, expect, test } from 'bun:test';

import type { ExecResult } from 'herdr';

import { requestFor, start } from '../../tests/pullRetryStore.ts';
import { gitFactsOf } from '../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../tests/pullSchedulerHarness.ts';
import { repositoryOf } from './gitIdentity.ts';

const folders = ['/code/a', '/code/b', '/code/c'];

const git = gitFactsOf(
  ...folders.map((folder) => ({ repository: repositoryOf(null, `${folder}/.git`), folder })),
);

const offline: ExecResult = { code: 1, stdout: '', stderr: 'offline' };

const repositoryAt = (folder: string): string => repositoryOf(null, `${folder}/.git`).key;

describe('createPullScheduler Retry', () => {
  test('Retry ignores backoff and the cap', async () => {
    const harness = new PullSchedulerHarness();
    const scheduler = harness.start({ pulls: {}, readTimes: {} });

    scheduler.tick(git, {}, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls.map((call) => call.cwd)).toEqual(['/code/a', '/code/b']);

    await harness.respondRemotesIn('/code/a', 'git@github.com:koja/koja.git');

    const failedRead = harness.callsIn('/code/a')[2];

    if (failedRead === undefined) {
      throw new Error('no pull read in /code/a');
    }

    await harness.respondCall(failedRead, offline);

    harness.setNow(start + 60_000);
    scheduler.tick(git, {}, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls.map((call) => call.cwd)).toEqual([
      '/code/a',
      '/code/b',
      '/code/a',
      '/code/a',
      '/code/c',
    ]);

    scheduler.tick(git, {}, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.calls).toHaveLength(5);

    harness.setRequests([requestFor('window-a', 'r-1', harness.now, repositoryAt('/code/a'))]);
    scheduler.tick(git, {}, new Map(), harness.spawn);
    await harness.settle();

    expect(harness.callsIn('/code/a')).toHaveLength(4);
    expect(harness.calls.at(-1)?.cwd).toBe('/code/a');
  });
});
