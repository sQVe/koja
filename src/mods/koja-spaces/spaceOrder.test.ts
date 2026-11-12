import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { readSpaceOrder } from '../../kit/spaceOrder.ts';
import { createOrderPublisher } from './spaceOrder.ts';
import type { GitInfo, ListedSpace, TreeRow } from './tree.ts';
import { groupRows, nestSpaces, repoOf } from './tree.ts';

const repoPath = '/code/koja/.git';

const spaceOf = (id: string): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: false,
  folder: '',
  machine: null,
  branch: null,
  active: false,
  status: null,
  tabs: [],
});

const gitOf = (linked: boolean): GitInfo => ({
  branch: 'main',
  repo: repoOf(null, repoPath),
  root: '/code/koja',
  cwd: '/',
  linked,
  committedAt: null,
});

const listed = (id: string, git: GitInfo | null): ListedSpace => ({
  space: spaceOf(id),
  git,
  status: null,
});

const memoryStore = () => {
  const values: Record<string, unknown> = {};

  return {
    values,
    get: (key: string): unknown => values[key],
    set: (key: string, value: unknown): void => {
      values[key] = value;
    },
  };
};

const rowsOf = (list: ListedSpace[], folded: string[] = []): TreeRow[] => {
  const foldedRepos = { has: (key: string) => folded.includes(key) };

  return nestSpaces(list, foldedRepos).flatMap(groupRows);
};

const repoList = (): ListedSpace[] => [
  listed('notes', null),
  listed('koja', gitOf(false)),
  listed('first-worktree', gitOf(true)),
  listed('second-worktree', gitOf(true)),
];

const allIds = (list: ListedSpace[]): string[] => list.map((row) => row.space.id);

describe('sidebar order publishing', () => {
  test('publishes the shown spaces top to bottom, with worktrees under their main space', () => {
    const store = memoryStore();

    createOrderPublisher(store.set).publish(rowsOf(repoList()), allIds(repoList()));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['notes', 'koja', 'first-worktree', 'second-worktree'],
      hidden: [],
      roots: ['koja'],
    });
  });

  test('publishes the spaces of a folded repository as hidden, not shown', () => {
    const store = memoryStore();
    const folded = [repoOf(null, repoPath).key];

    createOrderPublisher(store.set).publish(rowsOf(repoList(), folded), allIds(repoList()));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['notes', 'koja'],
      hidden: ['first-worktree', 'second-worktree'],
      roots: ['koja'],
    });
  });

  test('publishes the repository rows as roots, in shown order', () => {
    const store = memoryStore();
    const otherRepo = { ...gitOf(false), repo: repoOf(null, '/code/tau/.git') };

    const list = [
      listed('koja', gitOf(false)),
      listed('koja-worktree', gitOf(true)),
      listed('notes', null),
      listed('tau', otherRepo),
      listed('tau-worktree', { ...otherRepo, linked: true }),
    ];

    createOrderPublisher(store.set).publish(rowsOf(list), allIds(list));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['koja', 'koja-worktree', 'notes', 'tau', 'tau-worktree'],
      hidden: [],
      roots: ['koja', 'tau'],
    });
  });

  test('does not publish again while the rows stay the same', () => {
    const writes: unknown[] = [];

    const order = createOrderPublisher((_key, value) => {
      writes.push(value);
    });

    order.publish(rowsOf(repoList()), allIds(repoList()));
    order.publish(rowsOf(repoList()), allIds(repoList()));

    expect(writes).toHaveLength(1);
  });

  test('publishes again when a repository is folded', () => {
    const store = memoryStore();
    const order = createOrderPublisher(store.set);
    const folded = [repoOf(null, repoPath).key];

    order.publish(rowsOf(repoList()), allIds(repoList()));
    order.publish(rowsOf(repoList(), folded), allIds(repoList()));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['notes', 'koja'],
      hidden: ['first-worktree', 'second-worktree'],
      roots: ['koja'],
    });
  });

  test('clears the published order when the sidebar closes', () => {
    const store = memoryStore();
    const order = createOrderPublisher(store.set);

    order.publish(rowsOf(repoList()), allIds(repoList()));
    order.clear();

    expect(readSpaceOrder(store.get)).toBeNull();
  });

  test('publishes the same order again after it was cleared', () => {
    const store = memoryStore();
    const order = createOrderPublisher(store.set);

    order.publish(rowsOf(repoList()), allIds(repoList()));
    order.clear();
    order.publish(rowsOf(repoList()), allIds(repoList()));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['notes', 'koja', 'first-worktree', 'second-worktree'],
      hidden: [],
      roots: ['koja'],
    });
  });
});
