import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { placeOf, repositoryOf } from '../src/data/gitIdentity.ts';
import type { Pull } from '../src/data/pulls.ts';
import type { GitFacts, WorktreeGit } from '../src/data/snapshot.ts';
import { isRecord } from '../src/kit/fields.ts';
import { pullFacts } from './pullFacts.ts';

export type RawRecord = Record<string, unknown>;

export interface RawSnapshot {
  version: unknown;
  revision: unknown;
  facts: RawRecord;
}

export const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dir, '..', 'src', 'data', 'fixtures', name), 'utf8'));

export const keyOf = (machine: string | null, path: string): string =>
  JSON.stringify([machine, path]);

export const worktree = (machine: string | null, root: string): WorktreeGit => ({
  repository: repositoryOf(machine, `${root}/.git`),
  root,
  branch: 'main',
  linked: false,
});

export const gitFacts = (): GitFacts => {
  const place = placeOf(null, '/work');

  return {
    places: { [place.key]: { kind: 'repository', worktree: keyOf(null, '/work') } },
    worktrees: { [keyOf(null, '/work')]: worktree(null, '/work') },
  };
};

export const snapshotOf = (git: unknown): unknown => ({
  version: 4,
  revision: 4,
  facts: { git, pulls: {} },
});

export const pull = (fields: Partial<Pull> = {}): Pull =>
  pullFacts({ number: 1, headRefName: 'main', title: 'Title', ...fields });

export const repositoryKey = keyOf(null, '/work/.git');

export const validRaw = (): { snapshot: RawSnapshot; key: string } => {
  const key = keyOf(null, '/work');

  const snapshot: RawSnapshot = {
    version: 4,
    revision: 4,
    facts: {
      git: {
        places: { [key]: { kind: 'repository', worktree: key } },
        worktrees: {
          [key]: {
            repository: {
              machine: null,
              commonDirectory: '/work/.git',
              key: keyOf(null, '/work/.git'),
            },
            root: '/work',
            branch: 'main',
            linked: false,
          },
        },
      },
      pulls: {},
    },
  };

  return { snapshot, key };
};

export const recordIn = (value: unknown, name: string): RawRecord => {
  if (!isRecord(value)) {
    throw new Error(`the valid snapshot has no ${name}`);
  }

  return value;
};

export const gitAt = (snapshot: RawSnapshot): RawRecord => recordIn(snapshot.facts.git, 'git');

export const pullsAt = (snapshot: RawSnapshot): RawRecord =>
  recordIn(snapshot.facts.pulls, 'pulls');

export const placesAt = (snapshot: RawSnapshot): RawRecord =>
  recordIn(gitAt(snapshot).places, 'places');

export const worktreesAt = (snapshot: RawSnapshot): RawRecord =>
  recordIn(gitAt(snapshot).worktrees, 'worktrees');

export const worktreeAt = (snapshot: RawSnapshot, key: string): RawRecord =>
  recordIn(worktreesAt(snapshot)[key], 'worktree');

export const repositoryAt = (snapshot: RawSnapshot, key: string): RawRecord =>
  recordIn(worktreeAt(snapshot, key).repository, 'repository');

export const placeAt = (snapshot: RawSnapshot, key: string): RawRecord =>
  recordIn(placesAt(snapshot)[key], 'place');

export const placesIn = (value: unknown): RawRecord => {
  const snapshot = recordIn(value, 'snapshot');
  const facts = recordIn(snapshot.facts, 'facts');
  const git = recordIn(facts.git, 'git');

  return recordIn(git.places, 'places');
};
