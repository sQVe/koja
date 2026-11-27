import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { placeOf, repositoryOf, worktreeOf } from '../../data/gitIdentity.ts';
import type { SpaceStack, StackPull } from '../../data/spaceStack.ts';
import type { RowModel } from './listModel.ts';
import { stackCardOf } from './stackCard.ts';
import type { GitInfo, ListedSpace } from './tree.ts';

const git: GitInfo = {
  branch: 'me-3-top',
  worktreeKey: worktreeOf(null, '/code/koja').key,
  repo: repositoryOf(null, '/code/koja/.git'),
  root: '/code/koja',
  linked: true,
};

const space: SpaceInfo = {
  id: 'w',
  index: 1,
  name: 'w',
  named: false,
  folder: '/code/koja',
  machine: null,
  branch: 'me-3-top',
  active: false,
  status: null,
  tabs: [],
};

const listed: ListedSpace = {
  space,
  git,
  status: null,
  place: placeOf(null, '/code/koja'),
};

const rowModel = (stack: SpaceStack | null): RowModel => ({
  row: listed,
  project: 'koja',
  pull: null,
  ticket: null,
  ticketTitle: null,
  need: null,
  stack,
});

const stackPull = (overrides: Partial<StackPull>): StackPull => ({
  branch: 'me-1-low',
  ticket: null,
  number: null,
  title: null,
  state: 'open',
  checkedOut: false,
  restack: 'none',
  need: null,
  ...overrides,
});

const stackOf = (pulls: StackPull[]): SpaceStack => ({
  pulls,
  merged: pulls.filter((pull) => pull.state === 'merged').length,
  total: pulls.length,
});

describe('stackCardOf', () => {
  test('stackCardOf keeps merged numbers apart and the rest in stack order', () => {
    const stack = stackOf([
      stackPull({ branch: 'me-1-low', number: 503 }),
      stackPull({ branch: 'me-2-mid', number: 504, state: 'merged' }),
      stackPull({ branch: 'me-3-top', number: 505, checkedOut: true }),
      stackPull({ branch: 'me-4-higher', number: 506, state: 'merged' }),
    ]);

    const card = stackCardOf(rowModel(stack), 'The stack');

    expect(card?.merged).toEqual([504, 506]);
    expect(card?.pulls.map((pull) => pull.number)).toEqual([503, 505]);
  });

  test('a pull with no read title shows its branch', () => {
    const stack = stackOf([
      stackPull({ branch: 'me-1-low', number: 503, title: null }),
      stackPull({ branch: 'me-2-mid', number: 504, title: '' }),
    ]);

    const card = stackCardOf(rowModel(stack), 'The stack');

    expect(card?.pulls.map((pull) => pull.title)).toEqual(['me-1-low', 'me-2-mid']);
  });

  test("a pull's end shows its need, else draft or closed, else nothing", () => {
    const stack = stackOf([
      stackPull({ number: 507, need: 'review' }),
      stackPull({ number: 511, state: 'draft' }),
      stackPull({ number: 512, state: 'closed' }),
      stackPull({ number: 514 }),
    ]);

    const card = stackCardOf(rowModel(stack), 'The stack');

    expect(card?.pulls.map((pull) => pull.end)).toEqual(['review', 'draft', 'closed', null]);
  });
});
