import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import type { DataState } from '../../data/consumer.ts';
import type { Snapshot } from '../../data/snapshot.ts';
import { askProjects } from './askProjects.ts';

const space = (id: string, folder: string, name = 'Build window shell'): SpaceInfo =>
  ({ id, folder, name, tabs: [] }) as unknown as SpaceInfo;

const unavailable: DataState = { kind: 'unavailable' };

const withGit = (
  places: Record<string, unknown>,
  worktrees: Record<string, unknown>,
): DataState => {
  const facts = {
    git: { places, worktrees },
    pulls: {},
  } as unknown as Snapshot['facts'];

  return {
    kind: 'live',
    snapshot: { version: 4, revision: 1, facts },
    owner: 'koja-data',
    generation: 1,
    heartbeatAt: 1,
    staleAt: 2,
  };
};

describe('askProjects', () => {
  test('names the repository of a linked worktree from its common Git folder', () => {
    const place = JSON.stringify([null, '/code/koja/me-1226']);
    const repository = JSON.stringify([null, '/code/koja/.git']);

    const state = withGit(
      { [place]: { kind: 'repository', worktree: repository } },
      {
        [repository]: {
          repository: { machine: null, commonDirectory: '/code/koja/.git', key: repository },
          root: '/code/koja/me-1226',
          branch: 'me-1226-open-the-list',
          linked: true,
        },
      },
    );

    const projects = askProjects(state, [space('s1', '/code/koja/me-1226')], []);

    expect(projects.get('s1')).toBe('koja');
  });

  test('names a bare repository without its suffix', () => {
    const place = JSON.stringify([null, '/code/tau']);
    const repository = JSON.stringify([null, '/code/tau.git']);

    const state = withGit(
      { [place]: { kind: 'repository', worktree: repository } },
      {
        [repository]: {
          repository: { machine: null, commonDirectory: '/code/tau.git', key: repository },
          root: '/code/tau',
          branch: 'main',
          linked: false,
        },
      },
    );

    const projects = askProjects(state, [space('s1', '/code/tau')], []);

    expect(projects.get('s1')).toBe('tau');
  });

  test('names the folder when the space has no Git facts', () => {
    const missing = askProjects(unavailable, [space('s1', '/code/koja')], []);

    expect(missing.get('s1')).toBe('koja');

    const failed = withGit({ [JSON.stringify([null, '/code/koja'])]: { kind: 'failed' } }, {});
    const projects = askProjects(failed, [space('s1', '/code/koja')], []);

    expect(projects.get('s1')).toBe('koja');
  });

  test('names the space when its folder has no last part', () => {
    const projects = askProjects(unavailable, [space('s1', '/')], []);

    expect(projects.get('s1')).toBe('Build window shell');
  });
});
