import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PaneInfo, SpaceInfo } from 'herdr';

import { herdrFake } from '../../../tests/moduleFakes.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';
import type { Facts } from '../../data/snapshot.ts';
import type { SpaceFacts } from './spaceFacts.ts';

interface WorktreeFixture {
  root: string;
  commonDirectory: string;
  branch: string;
  linked: boolean;
  bare: boolean;
}

interface PullFixture {
  number: number;
  headRefName: string;
  commonDirectory: string;
  mergeable?: 'conflicting' | 'mergeable' | 'unknown';
  checks?: 'failing' | 'passing' | 'none';
  failed?: boolean;
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

const { paneFacts, spaceFacts, storedFacts } = (await import('./spaceFacts.ts')) as {
  spaceFacts: (
    facts: Facts | null,
    spaceList: SpaceInfo[],
    paneList: PaneInfo[],
  ) => Record<string, SpaceFacts>;
  paneFacts: (
    facts: Facts | null,
    machine: string | null,
    pane: PaneInfo,
    branch: string | null,
  ) => SpaceFacts | null;
  storedFacts: () => Facts | null;
};

const factsOf = (): Facts | null => storedFacts();

const spaceFactsOf = (spaceList: SpaceInfo[], paneList: PaneInfo[]): Record<string, SpaceFacts> =>
  spaceFacts(factsOf(), spaceList, paneList);

const paneFactsOf = (
  machine: string | null,
  pane: PaneInfo,
  branch: string | null,
): SpaceFacts | null => paneFacts(factsOf(), machine, pane, branch);

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
  name: null,
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
      bare: fixture.bare,
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
      failed: pull.failed === true || existing?.failed === true,
      pulls: [...(existing?.pulls ?? []), parsed],
    };
  }

  sharedValues[snapshotKey] = {
    version: snapshotVersion,
    revision: 1,
    facts: {
      git: { places, worktrees: gitWorktrees },
      pulls: repositories,
      trackers: {},
      stacks: {},
    },
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
          bare: false,
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

    const facts = spaceFactsOf([spaceAt('s1', '/code/koja/me-1189')], []);

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
          bare: false,
        },
      ],
      [{ number: 7, headRefName: 'main', commonDirectory: '/code/notes/.git' }],
    );

    const facts = spaceFactsOf([spaceAt('s1', '/code/notes')], []);

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
          bare: false,
        },
      ],
      [{ number: 7, headRefName: 'main', commonDirectory: '/code/notes/.git' }],
    );

    const facts = spaceFactsOf([spaceAt('s1', '/code/notes')], []);

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
          bare: false,
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

    const facts = spaceFactsOf([spaceAt('s1', '/code/notes')], []);

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
          bare: true,
        },
      ],
      [],
    );

    const facts = spaceFactsOf([spaceAt('s1', '/code/bare.git')], []);

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
          bare: false,
        },
      ],
      [],
    );

    const facts = spaceFactsOf([spaceAt('s1', '/code/work/repo')], []);

    expect(facts['s1']?.project).toBe('repo');
  });

  test('names a folder that is no repository after itself', () => {
    stored([], [], ['/code/plain']);

    const facts = spaceFactsOf([spaceAt('s1', '/code/plain')], []);

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
          bare: false,
        },
        {
          root: '/code/koja-side',
          commonDirectory: '/code/koja/.git',
          branch: 'side',
          linked: true,
          bare: false,
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
    const facts = paneFactsOf(null, pane, pane.branch);

    expect(facts).toEqual({ project: 'koja', pull: 9, need: 'conflict' });
  });

  test('answers no pull for a repository whose last refresh failed', () => {
    stored(
      [
        {
          root: '/code/notes',
          commonDirectory: '/code/notes/.git',
          branch: 'main',
          linked: false,
          bare: false,
        },
      ],
      [
        {
          number: 7,
          headRefName: 'main',
          commonDirectory: '/code/notes/.git',
          mergeable: 'conflicting',
          failed: true,
        },
      ],
    );

    const facts = spaceFactsOf([spaceAt('s1', '/code/notes')], []);

    expect(facts['s1']).toEqual({ project: 'notes', pull: null, need: null });
  });

  test('names both checkouts of one repository after its main checkout', () => {
    stored(
      [
        {
          root: '/code/widget',
          commonDirectory: '/git/widget-metadata',
          branch: 'main',
          linked: false,
          bare: false,
        },
        {
          root: '/code/widget-feature',
          commonDirectory: '/git/widget-metadata',
          branch: 'feature',
          linked: true,
          bare: false,
        },
      ],
      [],
    );

    const facts = spaceFactsOf(
      [spaceAt('s1', '/code/widget'), spaceAt('s2', '/code/widget-feature')],
      [],
    );

    expect(facts['s1']?.project).toBe('widget');
    expect(facts['s2']?.project).toBe('widget');
  });

  test('answers the pull of a pane in a subfolder of a recorded checkout', () => {
    stored(
      [
        {
          root: '/code/widget',
          commonDirectory: '/code/widget/.git',
          branch: 'feature',
          linked: false,
          bare: false,
        },
      ],
      [{ number: 42, headRefName: 'feature', commonDirectory: '/code/widget/.git' }],
    );

    const pane = { ...paneAt('/code/widget/src'), branch: 'feature' };
    const facts = paneFactsOf(null, pane, pane.branch);

    expect(facts).toEqual({ project: 'widget', pull: 42, need: null });
  });

  test('answers the pull of the branch the pane reports, not the snapshot branch', () => {
    stored(
      [
        {
          root: '/code/koja',
          commonDirectory: '/code/koja/.git',
          branch: 'main',
          linked: false,
          bare: false,
        },
      ],
      [
        { number: 5, headRefName: 'main', commonDirectory: '/code/koja/.git' },
        { number: 9, headRefName: 'side', commonDirectory: '/code/koja/.git' },
      ],
    );

    const pane = { ...paneAt('/code/koja'), branch: 'side' };

    expect(paneFactsOf(null, pane, pane.branch)?.pull).toBe(9);
  });

  test('answers the pull of a nested checkout over the outer one that records it', () => {
    stored(
      [
        {
          root: '/code',
          commonDirectory: '/code/.git',
          branch: 'outer',
          linked: false,
          bare: false,
        },
        {
          root: '/code/widget',
          commonDirectory: '/code/widget/.git',
          branch: 'inner',
          linked: false,
          bare: false,
        },
      ],
      [
        { number: 11, headRefName: 'outer', commonDirectory: '/code/.git' },
        { number: 42, headRefName: 'inner', commonDirectory: '/code/widget/.git' },
      ],
    );

    // Only the outer checkout has a place, so the walk up from the pane never reaches the inner one.
    const facts = (sharedValues[snapshotKey] as { facts: Facts }).facts;
    const innerKey = placeOf(null, '/code/widget').key;
    const kept = Object.entries(facts.git.places).filter(([key]) => key !== innerKey);

    facts.git.places = Object.fromEntries(kept);

    const pane = { ...paneAt('/code/widget/lib'), branch: 'inner' };
    const factsOfPane = paneFactsOf(null, pane, pane.branch);

    expect(factsOfPane?.project).toBe('widget');
    expect(factsOfPane?.pull).toBe(42);
  });

  test('answers no facts for a pane under a folder that is no repository', () => {
    stored([], [], ['/code/plain']);

    const pane = { ...paneAt('/code/plain/src'), branch: null };

    expect(paneFactsOf(null, pane, null)).toBeNull();
  });

  test('answers the pull of a pane in a sibling folder of a recorded subfolder', () => {
    stored(
      [
        {
          root: '/code/widget',
          commonDirectory: '/code/widget/.git',
          branch: 'feature',
          linked: false,
          bare: false,
        },
      ],
      [{ number: 42, headRefName: 'feature', commonDirectory: '/code/widget/.git' }],
    );

    // The data layer can record a space by one of its subfolders, leaving the checkout root with no
    // place of its own.
    const facts = (sharedValues[snapshotKey] as { facts: Facts }).facts;
    const rootKey = placeOf(null, '/code/widget').key;
    const entry = facts.git.places[rootKey] as { worktree: string };
    const subfolder = placeOf(null, '/code/widget/src').key;

    facts.git.places = { [subfolder]: { kind: 'repository', worktree: entry.worktree } };

    const pane = { ...paneAt('/code/widget/lib'), branch: 'feature' };

    expect(paneFactsOf(null, pane, pane.branch)?.pull).toBe(42);
  });

  test('answers no facts for a folder the data layer has not read', () => {
    stored([], []);

    expect(spaceFactsOf([spaceAt('s1', '/code/unknown')], [])).toEqual({});
  });

  test('answers no facts before the data layer has published anything', () => {
    expect(spaceFactsOf([spaceAt('s1', '/code/notes')], [])).toEqual({});
  });
});
