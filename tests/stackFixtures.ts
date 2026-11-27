import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RepositoryIdentity } from '../src/data/gitIdentity.ts';
import type { RepositoryStacks } from '../src/data/snapshot.ts';
import type { StackBranch } from '../src/data/stacks.ts';

export const ghStackRecord = (name: string): string =>
  readFileSync(join(import.meta.dir, '..', 'src', 'data', 'fixtures', 'gh-stack', `${name}.json`), {
    encoding: 'utf8',
  });

// The bases recorded in `several-stacks.json`, so every branch matches the head of the branch below
// it.
export const severalStacksHeads = new Map([
  ['main', 'fcacf79ff51ea778293a32460b14066356f3318d'],
  ['add-search', 'fece9ea9def9521a9b6628daa0cd7ccb4675d598'],
  ['add-search-ui', 'd05d6218226bd13d48cbf8d4a00df774dbb45cb2'],
  ['add-search-tests', 'd05d6218226bd13d48cbf8d4a00df774dbb45cb2'],
  ['fix-crash', '33cc8d7fd49ff3fd3841498f0a8c3208f7c1f6f9'],
  ['fix-crash-tests', '33cc8d7fd49ff3fd3841498f0a8c3208f7c1f6f9'],
]);

export const stacksOf = (
  repository: RepositoryIdentity,
  branches: readonly string[],
  restack: StackBranch['restack'] = 'none',
): Record<string, RepositoryStacks> => ({
  [repository.key]: {
    stacks: [
      {
        trunk: 'main',
        branches: branches.map((branch) => ({ branch, pullNumber: null, restack })),
      },
    ],
    failed: false,
  },
});
