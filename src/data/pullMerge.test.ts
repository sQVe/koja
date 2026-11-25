import { describe, expect, test } from 'bun:test';

import { githubFixture, runWith } from '../../tests/pullAnswers.ts';
import { pullFacts } from '../../tests/pullFacts.ts';
import { repositoryOf } from './gitIdentity.ts';
import { mergePulls, mergeReadTimes } from './pullMerge.ts';
import type { RepositoryReadTimes } from './pullReadTimes.ts';
import type { Pull } from './pulls.ts';
import { readRepositoryPulls } from './pulls.ts';
import type { PullSource } from './pullSources.ts';

const repository = repositoryOf(null, '/repo/.git');

const sourceOf = (branches: string[]): PullSource => ({ repository, cwd: '/repo', branches });

const previous = (headRefName: string): Pull =>
  pullFacts({
    number: 773,
    headRefName,
    mergeable: 'mergeable',
    mergeState: 'blocked',
    review: 'reviewRequired',
    checks: { kind: 'read', value: 'passing' },
    threads: { kind: 'read', value: { unresolved: 2, complete: true } },
  });

const previousTimes = (): RepositoryReadTimes => ({
  list: 1000,
  checks: { '773': 1000 },
  threads: { '773': 1000 },
});

describe('mergePulls and mergeReadTimes', () => {
  test('refreshes checks and keeps the last good threads with their age when threads fail', async () => {
    const read = await readRepositoryPulls(
      runWith([{ body: githubFixture('threads-failed.json'), code: 1 }]),
      sourceOf(['threads-failed']),
      () => true,
    );

    const pulls = read.kind === 'read' ? read.pulls : [];
    const merged = mergePulls([previous('threads-failed')], pulls);
    const times = mergeReadTimes(previousTimes(), merged, 5000);

    expect(merged[0]?.checks).toEqual({ kind: 'read', value: 'failing' });

    expect(merged[0]?.threads).toEqual({
      kind: 'failed',
      last: { unresolved: 2, complete: true },
    });

    expect(times).toEqual({ list: 5000, checks: { '773': 5000 }, threads: { '773': 1000 } });
  });

  test('keeps both parts and their ages when threads fail and no new checks arrive', async () => {
    const read = await readRepositoryPulls(
      runWith([{ body: githubFixture('checks-and-threads-failed.json'), code: 1 }]),
      sourceOf(['checks-and-threads-failed']),
      () => true,
    );

    const pulls = read.kind === 'read' ? read.pulls : [];
    const merged = mergePulls([previous('checks-and-threads-failed')], pulls);
    const times = mergeReadTimes(previousTimes(), merged, 5000);

    expect(merged[0]?.checks).toEqual({ kind: 'failed', last: 'passing' });

    expect(merged[0]?.threads).toEqual({
      kind: 'failed',
      last: { unresolved: 2, complete: true },
    });

    expect(times).toEqual({ list: 5000, checks: { '773': 1000 }, threads: { '773': 1000 } });
  });
});
