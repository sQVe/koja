import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import type { DataState } from '../../data/consumer.ts';
import type { PlaceGit, Snapshot, WorktreeGit } from '../../data/snapshot.ts';
import { askProjects } from './askProjects.ts';

const spaceOf = (id: string, folder: string, name = 'Build window shell'): SpaceInfo => ({
  id,
  index: 1,
  name,
  named: false,
  folder,
  machine: null,
  branch: null,
  active: false,
  status: null,
  tabs: [],
});

const unavailable: DataState = { kind: 'unavailable' };

const placeKey = (folder: string): string => JSON.stringify([null, folder]);

const worktreeKey = (root: string): string => JSON.stringify([null, root]);

const worktreeOf = (commonDirectory: string, root: string, linked: boolean): WorktreeGit => ({
  repository: { machine: null, commonDirectory, key: worktreeKey(commonDirectory) },
  root,
  branch: linked ? 'me-1226-open-the-list' : 'main',
  linked,
});

const withGit = (
  places: Record<string, PlaceGit>,
  worktrees: Record<string, WorktreeGit>,
): DataState => {
  const facts = { git: { places, worktrees }, pulls: {}, trackers: {}, stacks: {} };
  const snapshot: Snapshot = { version: 7, revision: 1, facts };

  return {
    kind: 'live',
    snapshot,
    owner: 'koja-data',
    generation: 1,
    heartbeatAt: 1,
    staleAt: 2,
  };
};

const linkedKoja = (): DataState => {
  const checkout = worktreeOf('/code/koja/.git', '/code/koja/me-1226', true);

  return withGit(
    {
      [placeKey('/code/koja/me-1226')]: {
        kind: 'repository',
        worktree: worktreeKey(checkout.root),
      },
    },
    { [worktreeKey(checkout.root)]: checkout },
  );
};

describe('askProjects', () => {
  test('names the repository of a linked worktree from its common Git folder', () => {
    const projects = askProjects(linkedKoja(), [spaceOf('s1', '/code/koja/me-1226')], []);

    expect(projects.get('s1')).toBe('koja');
  });

  test('names a repository from its main checkout when one is open', () => {
    const main = worktreeOf('/repos/store/upstream.git', '/code/herdr', false);
    const linked = worktreeOf('/repos/store/upstream.git', '/code/herdr-fix', true);

    const state = withGit(
      {
        [placeKey('/code/herdr')]: { kind: 'repository', worktree: worktreeKey(main.root) },
        [placeKey('/code/herdr-fix')]: { kind: 'repository', worktree: worktreeKey(linked.root) },
      },
      { [worktreeKey(main.root)]: main, [worktreeKey(linked.root)]: linked },
    );

    const spaces = [spaceOf('s1', '/code/herdr-fix'), spaceOf('s2', '/code/herdr')];
    const projects = askProjects(state, spaces, []);

    expect(projects.get('s1')).toBe('herdr');
    expect(projects.get('s2')).toBe('herdr');
  });

  test('names a bare repository from its common folder without the suffix', () => {
    const checkout = worktreeOf('/code/koja/.bare', '/code/koja-checkout', true);

    const state = withGit(
      {
        [placeKey('/code/koja-checkout')]: {
          kind: 'repository',
          worktree: worktreeKey(checkout.root),
        },
      },
      { [worktreeKey(checkout.root)]: checkout },
    );

    const projects = askProjects(state, [spaceOf('s1', '/code/koja-checkout')], []);

    expect(projects.get('s1')).toBe('koja');
  });

  test('names a separate Git folder without the suffix', () => {
    const checkout = worktreeOf('/code/tau.git', '/code/tau-checkout', true);

    const state = withGit(
      {
        [placeKey('/code/tau-checkout')]: {
          kind: 'repository',
          worktree: worktreeKey(checkout.root),
        },
      },
      { [worktreeKey(checkout.root)]: checkout },
    );

    const projects = askProjects(state, [spaceOf('s1', '/code/tau-checkout')], []);

    expect(projects.get('s1')).toBe('tau');
  });

  test('names the folder when the space has no Git facts', () => {
    const missing = askProjects(unavailable, [spaceOf('s1', '/code/koja')], []);

    expect(missing.get('s1')).toBe('koja');

    const failed = withGit({ [placeKey('/code/koja')]: { kind: 'failed' } }, {});
    const projects = askProjects(failed, [spaceOf('s1', '/code/koja')], []);

    expect(projects.get('s1')).toBe('koja');
  });

  test('names the folder when a repository name comes out empty', () => {
    const checkout = worktreeOf('/', '/', false);

    const state = withGit(
      { [placeKey('/code/koja')]: { kind: 'repository', worktree: worktreeKey(checkout.root) } },
      { [worktreeKey(checkout.root)]: checkout },
    );

    const projects = askProjects(state, [spaceOf('s1', '/code/koja')], []);

    expect(projects.get('s1')).toBe('koja');
  });

  test('names the space when its folder has no last part', () => {
    const projects = askProjects(unavailable, [spaceOf('s1', '/')], []);

    expect(projects.get('s1')).toBe('Build window shell');
  });
});
