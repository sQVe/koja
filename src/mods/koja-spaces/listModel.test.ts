import { describe, expect, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import { pullFacts, readyPull } from '../../../tests/pullFacts.ts';
import { stacksOf } from '../../../tests/stackFixtures.ts';
import type { DataState } from '../../data/consumer.ts';
import { placeOf, repositoryOf, worktreeOf } from '../../data/gitIdentity.ts';
import type { Pull } from '../../data/pulls.ts';
import type { Facts, TicketFacts } from '../../data/snapshot.ts';
import { emptyFacts, snapshotVersion } from '../../data/snapshot.ts';
import type { KeptNeed } from './gitFacts.ts';
import { gitInfoAt } from './gitFacts.ts';
import { listModelOf } from './listModel.ts';
import { noFolds } from './projects.ts';
import type { FoldedKeys, ListedSpace } from './tree.ts';

interface FactsOptions {
  pulls?: Pull[];
  branches?: readonly string[];
  branch?: string;
  tickets?: Record<string, TicketFacts>;
  failed?: boolean;
}

const folder = '/code/me-1-one';
const fixFolder = '/code/me-1-one-fix';
const repository = repositoryOf(null, `${folder}/.git`);
const worktree = worktreeOf(null, folder);
const fixWorktree = worktreeOf(null, fixFolder);
const place = placeOf(null, folder);
const fixPlace = placeOf(null, fixFolder);

const spaceOf = (id: string, status: Status | null, at = folder): SpaceInfo => ({
  id,
  index: 1,
  name: `name-${id}`,
  named: false,
  folder: at,
  machine: null,
  branch: null,
  active: false,
  status,
  tabs: [],
});

const factsOf = (options: FactsOptions = {}): Facts => ({
  ...emptyFacts(),
  git: {
    places: { [place.key]: { kind: 'repository', worktree: worktree.key } },
    worktrees: {
      [worktree.key]: {
        repository,
        root: folder,
        branch: options.branch ?? 'main',
        linked: false,
        bare: false,
      },
    },
  },
  pulls: {
    [repository.key]: { pulls: options.pulls ?? [], failed: options.failed ?? false },
  },
  trackers: {
    [repository.key]: {
      workspace: 'sqve',
      tickets: options.tickets ?? {},
      failed: false,
    },
  },
  stacks: options.branches === undefined ? {} : stacksOf(repository, options.branches),
});

const twoCheckoutFacts = (): Facts => ({
  ...emptyFacts(),
  git: {
    places: {
      [place.key]: { kind: 'repository', worktree: worktree.key },
      [fixPlace.key]: { kind: 'repository', worktree: fixWorktree.key },
    },
    worktrees: {
      [worktree.key]: { repository, root: folder, branch: 'main', linked: false, bare: false },
      [fixWorktree.key]: {
        repository,
        root: fixFolder,
        branch: 'main',
        linked: true,
        bare: false,
      },
    },
  },
});

const stateOf = (facts: Facts): DataState => ({
  kind: 'live',
  snapshot: { version: snapshotVersion, revision: 1, facts },
  owner: 'window-a',
  generation: 1,
  heartbeatAt: 0,
  staleAt: 30_000,
});

const listedOf = (state: DataState, space: SpaceInfo): ListedSpace => {
  const at = placeOf(space.machine, space.folder);

  return { space, git: gitInfoAt(state, at) ?? null, status: space.status, place: at };
};

const ticketFacts = (id: string, title: string, parent: string | null = null): TicketFacts => ({
  id,
  title,
  state: 'In Progress',
  url: `https://linear.app/sqve/issue/${id}`,
  parent,
});

const failingPull = pullFacts({
  number: 11,
  headRefName: 'main',
  checks: { kind: 'read', value: 'failing' },
});

describe('listModelOf', () => {
  test('the Inbox ids follow the drawn groups', () => {
    const state = stateOf(factsOf({ pulls: [failingPull] }));
    const idle = listedOf(state, spaceOf('idle', 'idle'));
    const blocked = listedOf(state, spaceOf('blocked', 'blocked'));

    const model = listModelOf({
      state,
      listed: [idle, blocked],
      folds: noFolds,
      view: 'inbox',
      lastNeeds: new Map(),
    });

    expect(model.ids).toEqual(['blocked', 'idle']);
  });

  test("a stack space's row carries its stack, its parent title, and its most blocking need", () => {
    const state = stateOf(
      factsOf({
        branches: ['me-1-one', 'me-2-two'],
        branch: 'me-2-two',
        tickets: {
          'ME-1': ticketFacts('ME-1', 'Lower', 'ME-9'),
          'ME-2': ticketFacts('ME-2', 'Upper', 'ME-9'),
          'ME-9': ticketFacts('ME-9', 'The shared parent'),
        },
        pulls: [
          pullFacts({
            number: 11,
            headRefName: 'me-1-one',
            checks: { kind: 'read', value: 'failing' },
          }),
          readyPull({ number: 12, headRefName: 'me-2-two' }),
        ],
      }),
    );

    const space = listedOf(state, spaceOf('w', 'idle'));

    const model = listModelOf({
      state,
      listed: [space],
      folds: noFolds,
      view: 'projects',
      lastNeeds: new Map(),
    });

    const row = model.rows.get('w');

    expect(row?.stack?.total).toBe(2);
    expect(row?.ticketTitle).toBe('The shared parent');
    expect(row?.need).toBe('failing');
  });

  test('a row keeps no stack, ticket title, or need when the data state is unavailable', () => {
    // The guard checks the state, not only the row, so this row keeps the facts of an earlier read.
    const read = stateOf(factsOf({ branches: ['me-1-one'], branch: 'me-1-one' }));

    const model = listModelOf({
      state: { kind: 'unavailable' },
      listed: [listedOf(read, spaceOf('w', 'idle'))],
      folds: noFolds,
      view: 'projects',
      lastNeeds: new Map(),
    });

    const row = model.rows.get('w');

    expect(row?.stack).toBeNull();
    expect(row?.ticketTitle).toBeNull();
    expect(row?.need).toBeNull();
  });

  test('a failed PR read keeps the last need on the row', () => {
    const lastNeeds = new Map<string, KeptNeed>();
    const read = stateOf(factsOf({ pulls: [failingPull] }));

    const before = listModelOf({
      state: read,
      listed: [listedOf(read, spaceOf('w', 'idle'))],
      folds: noFolds,
      view: 'projects',
      lastNeeds,
    });

    expect(before.rows.get('w')?.need).toBe('failing');

    const failed = stateOf(factsOf({ failed: true }));

    const after = listModelOf({
      state: failed,
      listed: [listedOf(failed, spaceOf('w', 'idle'))],
      folds: noFolds,
      view: 'projects',
      lastNeeds,
    });

    expect(after.rows.get('w')?.need).toBe('failing');
  });

  test('a folded project hides its spaces in Projects but not in the Inbox', () => {
    const state = stateOf(twoCheckoutFacts());

    const listed = [
      listedOf(state, spaceOf('m', 'idle')),
      listedOf(state, spaceOf('w', 'idle', fixFolder)),
    ];

    const folds: FoldedKeys = { has: (key) => key === repository.key };

    const projects = listModelOf({
      state,
      listed,
      folds,
      view: 'projects',
      lastNeeds: new Map(),
    });

    expect(projects.ids).toEqual(['m']);
    expect(projects.rows.has('w')).toBe(true);

    const inbox = listModelOf({ state, listed, folds, view: 'inbox', lastNeeds: new Map() });

    expect(inbox.ids).toEqual(['m', 'w']);
  });
});
