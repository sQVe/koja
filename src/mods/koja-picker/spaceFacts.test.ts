import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PaneInfo, SpaceInfo } from 'herdr';

import { herdrFake } from '../../../tests/moduleFakes.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';

interface WorktreeFixture {
  root: string;
  commonDirectory: string;
  branch: string;
  linked: boolean;
}

interface PullFixture {
  number: number;
  headRefName: string;
  commonDirectory: string;
  mergeable?: 'conflicting' | 'mergeable' | 'unknown';
  checks?: 'failing' | 'passing' | 'none';
}

let sharedValues: Record<string, unknown> = {};

Object.assign(globalThis, { kojaModName: 'koja-picker' });

await mock.module('herdr', () =>
  herdrFake({
    shared: (key: string) => sharedValues[key],
  }),
);

const { repositoryOf, worktreeOf, placeOf } = await import('../../data/gitIdentity.ts');
const { heartbeatKey } = await import('../../data/lease.ts');
const { snapshotKey, snapshotVersion } = await import('../../data/snapshot.ts');

const { paneFacts, spaceFacts } = (await import('./spaceFacts.ts')) as {
  spaceFacts: (
    spaceList: SpaceInfo[],
    paneList: PaneInfo[],
  ) => Record<string, { project: string; pull: number | null; need: string | null }>;
  paneFacts: (
    machine: string | null,
    pane: PaneInfo,
    branch: string | null,
  ) => { project: string; pull: number | null; need: string | null } | null;
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  sharedValues = {};
});

const spaceAt = (id: string, folder: string): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: true,
  folder,
  machine: null,
  branch: null,
  active: false,
  status: null,
  tabs: [],
});

const paneAt = (cwd: string): PaneInfo => ({
  pane: 'p1',
  terminal: 't1',
  tab: 'k1',
  title: 'Pi',
  cwd,
  branch: null,
  status: null,
  app: null,
  program: {
    key: 'shell',
    name: 'zsh',
    icon: null,
    tint: false,
    tile: null,
    color: null,
    shell: true,
    agent: false,
  },
  focused: true,
  zoomed: false,
  movable: true,
});

const stored = (
  worktrees: WorktreeFixture[],
  pulls: PullFixture[],
  plainFolders: string[] = [],
): void => {
  const places: Record<string, unknown> = {};

  for (const folder of plainFolders) {
    places[placeOf(null, folder).key] = { kind: 'none' };
  }

  const gitWorktrees: Record<string, unknown> = {};

  for (const fixture of worktrees) {
    const place = placeOf(null, fixture.root);
    const worktree = worktreeOf(null, fixture.root);
    const repository = repositoryOf(null, fixture.commonDirectory);

    places[place.key] = { kind: 'repository', worktree: worktree.key };

    gitWorktrees[worktree.key] = {
      repository: {
        machine: null,
        commonDirectory: repository.commonDirectory,
        key: repository.key,
      },
      root: fixture.root,
      branch: fixture.branch,
      linked: fixture.linked,
    };
  }

  const repositories: Record<string, unknown> = {};

  for (const pull of pulls) {
    const repository = repositoryOf(null, pull.commonDirectory);

    const parsed = pullFacts({
      number: pull.number,
      headRefName: pull.headRefName,
      title: 'A pull request',
      ...(pull.mergeable === undefined ? {} : { mergeable: pull.mergeable }),
      ...(pull.checks === undefined ? {} : { checks: { kind: 'read', value: pull.checks } }),
    });

    const existing = repositories[repository.key] as
      | { failed: boolean; pulls: unknown[] }
      | undefined;

    repositories[repository.key] = {
      failed: false,
      pulls: [...(existing?.pulls ?? []), parsed],
    };
  }

  sharedValues[snapshotKey] = {
    version: snapshotVersion,
    revision: 1,
    facts: { git: { places, worktrees: gitWorktrees }, pulls: repositories },
  };

  const heartbeat = { version: 1, owner: 'test', generation: 1, at: Date.now() };

  sharedValues[heartbeatKey] = heartbeat;
};

describe('spaceFacts', () => {
  test('names the project of a linked worktree after the repository it belongs to', () => {
    stored(
      [
        {
          root: '/code/koja/me-1189',
          commonDirectory: '/code/koja/.git',
          branch: 'me-1189-go-to',
          linked: true,
        },
      ],
      [
        {
          number: 41,
          headRefName: 'me-1189-go-to',
          commonDirectory: '/code/koja/.git',
          mergeable: 'conflicting',
        },
      ],
    );

    const facts = spaceFacts([spaceAt('s1', '/code/koja/me-1189')], []);

    expect(facts['s1']).toEqual({ project: 'koja', pull: 41, need: 'conflict' });
  });

  test('names the project of a main worktree after its own folder', () => {
    stored(
      [
        {
          root: '/code/notes',
          commonDirectory: '/code/notes/.git',
          branch: 'main',
          linked: false,
        },
      ],
      [{ number: 7, headRefName: 'main', commonDirectory: '/code/notes/.git' }],
    );

    const facts = spaceFacts([spaceAt('s1', '/code/notes')], []);

    expect(facts['s1']?.project).toBe('notes');
    expect(facts['s1']?.pull).toBe(7);
  });

  test('leaves out the pull of a branch the repository has no pull for', () => {
    stored(
      [
        {
          root: '/code/notes',
          commonDirectory: '/code/notes/.git',
          branch: 'other-branch',
          linked: false,
        },
      ],
      [{ number: 7, headRefName: 'main', commonDirectory: '/code/notes/.git' }],
    );

    const facts = spaceFacts([spaceAt('s1', '/code/notes')], []);

    expect(facts['s1']).toEqual({ project: 'notes', pull: null, need: null });
  });

  test('shows the most urgent need of a pull that needs two things', () => {
    stored(
      [
        {
          root: '/code/notes',
          commonDirectory: '/code/notes/.git',
          branch: 'main',
          linked: false,
        },
      ],
      [
        {
          number: 7,
          headRefName: 'main',
          commonDirectory: '/code/notes/.git',
          mergeable: 'conflicting',
          checks: 'failing',
        },
      ],
    );

    const facts = spaceFacts([spaceAt('s1', '/code/notes')], []);

    expect(facts['s1']?.need).toBe('conflict');
  });

  test('names a bare repository without its .git suffix', () => {
    stored(
      [
        {
          root: '/code/bare.git',
          commonDirectory: '/code/bare.git',
          branch: 'main',
          linked: false,
        },
      ],
      [],
    );

    const facts = spaceFacts([spaceAt('s1', '/code/bare.git')], []);

    expect(facts['s1']?.project).toBe('bare');
  });

  test('names the project of a worktree of a .bare repository after that repository', () => {
    stored(
      [
        {
          root: '/code/work/repo',
          commonDirectory: '/code/work/repo/.bare',
          branch: 'main',
          linked: true,
        },
      ],
      [],
    );

    const facts = spaceFacts([spaceAt('s1', '/code/work/repo')], []);

    expect(facts['s1']?.project).toBe('repo');
  });

  test('names a folder that is no repository after itself', () => {
    stored([], [], ['/code/plain']);

    const facts = spaceFacts([spaceAt('s1', '/code/plain')], []);

    expect(facts['s1']).toEqual({ project: 'plain', pull: null, need: null });
  });

  test('answers the pull of the branch the pane is on, not of its space', () => {
    stored(
      [
        {
          root: '/code/koja',
          commonDirectory: '/code/koja/.git',
          branch: 'main',
          linked: false,
        },
        {
          root: '/code/koja-side',
          commonDirectory: '/code/koja/.git',
          branch: 'side',
          linked: true,
        },
      ],
      [
        { number: 5, headRefName: 'main', commonDirectory: '/code/koja/.git' },
        {
          number: 9,
          headRefName: 'side',
          commonDirectory: '/code/koja/.git',
          mergeable: 'conflicting',
        },
      ],
    );

    const pane = { ...paneAt('/code/koja-side'), branch: 'side' };
    const facts = paneFacts(null, pane, pane.branch);

    expect(facts).toEqual({ project: 'koja', pull: 9, need: 'conflict' });
  });

  test('answers no facts for a folder the data layer has not read', () => {
    stored([], []);

    expect(spaceFacts([spaceAt('s1', '/code/unknown')], [])).toEqual({});
  });

  test('answers no facts before the data layer has published anything', () => {
    expect(spaceFacts([spaceAt('s1', '/code/notes')], [])).toEqual({});
  });
});
