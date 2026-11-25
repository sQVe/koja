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
