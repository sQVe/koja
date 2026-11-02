// A repository's pull requests, read from `gh pr list --json` and cached by repository.

import { listOf, numberOf, recordOf, stringOf } from '../../kit/fields.ts';
import type { GitInfo } from './tree.ts';

export interface Pull {
  number: number;
  state: string;
  isDraft: boolean;
  title: string;
  headRefName: string;
}

export interface PullCache {
  fetchedAt: number;
  list: Pull[];
}

export const pullFields = 'number,state,isDraft,title,headRefName';

const readPull = (value: unknown): Pull | null => {
  const fields = recordOf(value);
  const number = numberOf(fields['number']);
  const state = stringOf(fields['state']);
  const headRefName = stringOf(fields['headRefName']);

  if (number === null || state === null || headRefName === null) {
    return null;
  }

  const title = stringOf(fields['title']) ?? '';

  return { number, state, isDraft: fields['isDraft'] === true, title, headRefName };
};

export const readPullList = (value: unknown): Pull[] =>
  listOf(value)
    .map(readPull)
    .filter((pull): pull is Pull => pull !== null);

export const readPullCaches = (stored: unknown): Record<string, PullCache> => {
  const entries = Object.entries(recordOf(stored)).map(([repo, cache]) => {
    const fields = recordOf(cache);

    return [
      repo,
      { fetchedAt: numberOf(fields['fetchedAt']) ?? 0, list: readPullList(fields['list']) },
    ] as const;
  });

  return Object.fromEntries(entries);
};

export const pullState = (pull: Pull): string =>
  pull.isDraft && pull.state === 'OPEN' ? 'draft' : pull.state.toLowerCase();

// The branch's open pull request, else its newest one; gh lists the newest first.
export const pullOf = (git: GitInfo | null, caches: Record<string, PullCache>): Pull | null => {
  if (git?.branch === null || git?.branch === undefined) {
    return null;
  }

  const mine = (caches[git.repo.key]?.list ?? []).filter((pull) => pull.headRefName === git.branch);

  return mine.find((pull) => pull.state === 'OPEN') ?? mine[0] ?? null;
};
