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

export const worktree = (machine: string | null, root: string): WorktreeGit => ({
  repository: repositoryOf(machine, `${root}/.git`),
  root,
  branch: 'main',
  linked: false,
});

export const gitFacts = (): GitFacts => {
  const place = placeOf(null, '/work');

  return {
    places: { [place.key]: { kind: 'repository', worktree: place.key } },
    worktrees: { [place.key]: worktree(null, '/work') },
  };
};

export const snapshotOf = (git: unknown): unknown => ({
  version: 7,
  revision: 4,
  facts: { git, pulls: {}, trackers: {}, stacks: {} },
});

export const pull = (fields: Partial<Pull> = {}): Pull =>
  pullFacts({ number: 1, headRefName: 'main', title: 'Title', ...fields });

export const repositoryKey = repositoryOf(null, '/work/.git').key;

const ticketFacts = (): RawRecord => ({
  id: 'ME-1',
  title: 'Title',
  state: 'In Progress',
  url: 'https://linear.app/sqve/issue/ME-1',
  parent: null,
});

export const trackerFacts = (): RawRecord => ({
  workspace: 'sqve',
  tickets: { 'ME-1': ticketFacts() },
  failed: false,
});

export const validRaw = (): { snapshot: RawSnapshot; key: string } => {
  const key = placeOf(null, '/work').key;

  const snapshot: RawSnapshot = {
    version: 7,
    revision: 4,
    facts: {
      git: {
        places: { [key]: { kind: 'repository', worktree: key } },
        worktrees: {
          [key]: {
            repository: {
              machine: null,
              commonDirectory: '/work/.git',
              key: repositoryOf(null, '/work/.git').key,
            },
            root: '/work',
            branch: 'main',
            linked: false,
          },
        },
      },
      pulls: {},
      trackers: { [repositoryKey]: trackerFacts() },
      stacks: {},
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

export const rawSnapshotOf = (value: unknown): RawSnapshot => {
  const snapshot = recordIn(value, 'snapshot');

  return {
    version: snapshot.version,
    revision: snapshot.revision,
    facts: recordIn(snapshot.facts, 'facts'),
  };
};

export const pullsAt = (snapshot: RawSnapshot): RawRecord =>
  recordIn(snapshot.facts.pulls, 'pulls');

export const trackersAt = (snapshot: RawSnapshot): RawRecord =>
  recordIn(snapshot.facts.trackers, 'trackers');

export const trackerAt = (snapshot: RawSnapshot, key: string): RawRecord =>
  recordIn(trackersAt(snapshot)[key], 'tracker');

export const ticketAt = (snapshot: RawSnapshot, repository: string, ticket: string): RawRecord => {
  const tickets = recordIn(trackerAt(snapshot, repository).tickets, 'tickets');

  return recordIn(tickets[ticket], 'ticket');
};

export const ticketsAt = (snapshot: RawSnapshot, repository: string): RawRecord =>
  recordIn(trackerAt(snapshot, repository).tickets, 'tickets');

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
