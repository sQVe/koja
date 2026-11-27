import type { Pull } from '../src/data/pulls.ts';

export const pullFacts = (fields: Pick<Pull, 'number' | 'headRefName'> & Partial<Pull>): Pull => ({
  state: 'OPEN',
  isDraft: false,
  title: '',
  mergeable: 'unknown',
  mergeState: 'unknown',
  review: 'none',
  checks: { kind: 'unread' },
  threads: { kind: 'unread' },
  ...fields,
});

export const readyPull = (fields: Partial<Pull> = {}): Pull =>
  pullFacts({
    number: 1,
    headRefName: 'main',
    mergeable: 'mergeable',
    mergeState: 'clean',
    review: 'approved',
    checks: { kind: 'read', value: 'passing' },
    threads: { kind: 'read', value: { unresolved: 0, complete: true } },
    ...fields,
  });
