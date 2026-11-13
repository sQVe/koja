import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { readSpaceOrder } from '../../kit/spaceOrder.ts';
import type { Project } from './projects.ts';
import { groupProjects } from './projects.ts';
import { createOrderPublisher } from './spaceOrder.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import { placeOf, repoOf } from './tree.ts';

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
  place: placeOf(null, git?.root ?? '/notes'),
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

const projectsOf = (list: ListedSpace[], folded: string[] = []): Project[] =>
  groupProjects(list, { has: (key: string) => folded.includes(key) });

const repoList = (): ListedSpace[] => [
  listed('notes', null),
  listed('koja', gitOf(false)),
  listed('first-worktree', gitOf(true)),
  listed('second-worktree', gitOf(true)),
];

const allIds = (list: ListedSpace[]): string[] => list.map((row) => row.space.id);

describe('sidebar order publishing', () => {
  test('publishes the shown spaces top to bottom, project by project', () => {
    const store = memoryStore();

    createOrderPublisher(store.set).publish(projectsOf(repoList()), allIds(repoList()));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['notes', 'koja', 'first-worktree', 'second-worktree'],
      hidden: [],
      roots: ['notes', 'koja'],
    });
  });

  test('publishes the spaces of a folded project as hidden, not shown', () => {
    const store = memoryStore();
    const folded = [repoOf(null, repoPath).key];

    createOrderPublisher(store.set).publish(projectsOf(repoList(), folded), allIds(repoList()));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['notes'],
      hidden: ['koja', 'first-worktree', 'second-worktree'],
      roots: ['notes'],
    });
  });

  test('publishes the first shown space of each project as a root, in shown order', () => {
    const store = memoryStore();
    const otherRepo = { ...gitOf(false), repo: repoOf(null, '/code/tau/.git') };

    const list = [
      listed('koja', gitOf(false)),
      listed('koja-worktree', gitOf(true)),
      listed('tau-worktree', { ...otherRepo, linked: true }),
      listed('tau', otherRepo),
    ];

    createOrderPublisher(store.set).publish(projectsOf(list), allIds(list));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['koja', 'koja-worktree', 'tau-worktree', 'tau'],
      hidden: [],
      roots: ['koja', 'tau-worktree'],
    });
  });

  test('does not publish again while the projects stay the same', () => {
    const writes: unknown[] = [];

    const order = createOrderPublisher((_key, value) => {
      writes.push(value);
    });

    order.publish(projectsOf(repoList()), allIds(repoList()));
    order.publish(projectsOf(repoList()), allIds(repoList()));

    expect(writes).toHaveLength(1);
  });

  test('publishes again when a project is folded', () => {
    const store = memoryStore();
    const order = createOrderPublisher(store.set);
    const folded = [repoOf(null, repoPath).key];

    order.publish(projectsOf(repoList()), allIds(repoList()));
    order.publish(projectsOf(repoList(), folded), allIds(repoList()));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['notes'],
      hidden: ['koja', 'first-worktree', 'second-worktree'],
      roots: ['notes'],
    });
  });

  test('clears the published order when the sidebar closes', () => {
    const store = memoryStore();
    const order = createOrderPublisher(store.set);

    order.publish(projectsOf(repoList()), allIds(repoList()));
    order.clear();

    expect(readSpaceOrder(store.get)).toBeNull();
  });

  test('publishes the same order again after it was cleared', () => {
    const store = memoryStore();
    const order = createOrderPublisher(store.set);

    order.publish(projectsOf(repoList()), allIds(repoList()));
    order.clear();
    order.publish(projectsOf(repoList()), allIds(repoList()));

    expect(readSpaceOrder(store.get)).toEqual({
      shown: ['notes', 'koja', 'first-worktree', 'second-worktree'],
      hidden: [],
      roots: ['notes', 'koja'],
    });
  });
});
