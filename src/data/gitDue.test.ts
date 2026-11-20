import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program, SpaceInfo, Status, TabInfo } from 'herdr';

import type { DueInput, DueResult, GitWorld, ReadMemory } from './gitDue.ts';
import { duePlaces, emptyDueState } from './gitDue.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import { observePlaces } from './places.ts';
import { emptyFacts } from './snapshot.ts';
import type { GitFacts, PlaceGit, WorktreeGit } from './snapshot.ts';

const shell: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

const tabOf = (id: string): TabInfo => ({
  id,
  index: 1,
  name: '1',
  named: false,
  active: true,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

const spaceOf = (id: string, folder: string, machine: string | null = null): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: false,
  folder,
  machine,
  branch: null,
  active: false,
  status: null,
  tabs: [tabOf(`tab-${id}`)],
});

const terminal = (pane: string, tab: string, status: Status | null): PaneInfo => ({
  pane,
  terminal: `t-${pane}`,
  tab,
  title: 'zsh',
  cwd: null,
  branch: null,
  status,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

const worldOf = (spaces: SpaceInfo[], panes: PaneInfo[] = []): GitWorld => ({
  spaces,
  panes,
  machines: [],
});

const placeKey = (folder: string, machine: string | null = null): string =>
  placeOf(machine, folder).key;

const readAt = (keys: readonly string[], lastReadAt: number): Record<string, ReadMemory> => {
  const reads: Record<string, ReadMemory> = {};

  for (const key of keys) {
    reads[key] = { lastReadAt, failure: false };
  }

  return reads;
};

const worktreeOfFolder = (folder: string): string => worktreeOf(null, folder).key;

const factsOf = (entries: readonly (readonly [string, string])[]): GitFacts => {
  const repository = repositoryOf(null, '/code/koja/.git');
  const places: Record<string, PlaceGit> = {};
  const worktrees: Record<string, WorktreeGit> = {};

  for (const [folder, worktreeFolder] of entries) {
    const key = worktreeOfFolder(worktreeFolder);

    places[placeKey(folder)] = { kind: 'repository', worktree: key };
    worktrees[key] = { repository, root: worktreeFolder, branch: 'main', linked: false };
  }

  return { places, worktrees };
};

const inputOf = (
  facts: GitFacts,
  reads: Record<string, ReadMemory>,
  state = emptyDueState(),
): DueInput => ({ state, reads, facts });

const sorted = (values: Iterable<string>): string[] => [...values].toSorted();

const dueOf = (input: DueInput, world: GitWorld, now: number): DueResult =>
  duePlaces(input, world, observePlaces(world.spaces, world.panes), now);

describe('duePlaces', () => {
  test('marks a place the space moved to', () => {
    const facts = emptyFacts().git;
    const reads = readAt([placeKey('/code/koja'), placeKey('/code/tikk')], 10);
    const before = { ...emptyDueState(), places: { s1: placeOf(null, '/code/koja') } };

    const result = dueOf(inputOf(facts, reads, before), worldOf([spaceOf('s1', '/code/tikk')]), 10);

    expect(sorted(result.due)).toEqual([placeKey('/code/tikk')]);
  });

  test('marks every place in a repository when a pane there stops working', () => {
    const folders = ['/code/koja', '/code/tikk'];
    const facts = factsOf(folders.map((folder) => [folder, folder] as const));

    const reads = readAt(
      folders.map((folder) => placeKey(folder)),
      10,
    );

    const spaces = [spaceOf('s1', '/code/koja'), spaceOf('s2', '/code/tikk')];
    const working = worldOf(spaces, [terminal('p1', 'tab-s1', 'working')]);
    const idle = worldOf(spaces, [terminal('p1', 'tab-s1', 'idle')]);

    const first = dueOf(inputOf(facts, reads), working, 10);
    const second = dueOf(inputOf(facts, reads, first.state), idle, 10);

    expect(sorted(first.due)).toEqual([]);
    expect(sorted(second.due)).toEqual(sorted(folders.map((folder) => placeKey(folder))));
  });

  test('marks the places of a machine whose layout is ready again', () => {
    const facts = emptyFacts().git;
    const reads = readAt([placeKey('/code/koja'), placeKey('/srv/app', 'qa')], 10);
    const spaces = [spaceOf('s1', '/code/koja'), spaceOf('s2', '/srv/app', 'qa')];

    const loading: GitWorld = {
      spaces,
      panes: [],
      machines: [{ name: 'qa', layout: 'loading' }],
    };

    const ready: GitWorld = {
      spaces,
      panes: [],
      machines: [{ name: 'qa', layout: 'ready' }],
    };

    const first = dueOf(inputOf(facts, reads), loading, 10);
    const second = dueOf(inputOf(facts, reads, first.state), ready, 10);

    expect(sorted(first.due)).toEqual([]);
    expect(sorted(second.due)).toEqual([placeKey('/srv/app', 'qa')]);
  });

  test('marks one representative per worktree for the fallback', () => {
    const folders = ['/code/a1', '/code/a2', '/code/b1', '/code/b2'];

    const facts = factsOf([
      ['/code/a1', '/code/a1'],
      ['/code/a2', '/code/a1'],
      ['/code/b1', '/code/b1'],
      ['/code/b2', '/code/b1'],
    ]);

    const reads = readAt(
      folders.map((folder) => placeKey(folder)),
      0,
    );

    const spaces = folders.map((folder, index) => spaceOf(`s${index}`, folder));

    const result = dueOf(inputOf(facts, reads), worldOf(spaces), 60_001);

    expect(sorted(result.due)).toEqual([placeKey('/code/a1'), placeKey('/code/b1')]);
  });
});
