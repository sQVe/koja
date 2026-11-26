import type { PaneInfo, SpaceInfo, machines } from 'herdr';

import type { Place } from './gitIdentity.ts';
import type { PlaceObservation } from './places.ts';
import type { GitFacts, PlaceGit } from './snapshot.ts';

export interface GitWorld {
  spaces: SpaceInfo[];
  panes: PaneInfo[];
  machines: ReturnType<typeof machines>;
}

export interface ReadMemory {
  lastReadAt: number;
  failure: boolean;
}

export interface DueState {
  places: Record<string, Place>;
  busy: Record<string, boolean>;
  ready: Record<string, boolean>;
}

export interface DueInput {
  state: DueState;
  reads: Readonly<Record<string, ReadMemory>>;
  facts: GitFacts;
}

export type ReadReason = 'refresh' | 'mapping';

export interface DueResult {
  due: Map<string, ReadReason>;
  state: DueState;
}

interface PaneActivity {
  busy: Record<string, boolean>;
  finished: Set<string>;
}

interface DueContext {
  input: DueInput;
  places: Record<string, Place>;
  live: Readonly<Record<string, Place>>;
  due: Map<string, ReadReason>;
  now: number;
}

// A read with no watch behind it is refreshed after this long, so a change it missed still lands.
export const staleReadMilliseconds = 60_000;

export const emptyDueState = (): DueState => ({ places: {}, busy: {}, ready: {} });

export const worktreeRepresentatives = (
  places: Readonly<Record<string, PlaceGit>>,
  live: Readonly<Record<string, Place>>,
): Map<string, string> => {
  const representatives = new Map<string, string>();

  for (const [key, place] of Object.entries(places)) {
    if (!Object.hasOwn(live, key) || place.kind !== 'repository') {
      continue;
    }

    const current = representatives.get(place.worktree);

    if (current === undefined || key < current) {
      representatives.set(place.worktree, key);
    }
  }

  return representatives;
};

const spaceByTab = (world: GitWorld): Map<string, SpaceInfo> => {
  const spaces = new Map<string, SpaceInfo>();

  for (const space of world.spaces) {
    for (const tab of space.tabs) {
      spaces.set(tab.id, space);
    }
  }

  return spaces;
};

const isBusy = (pane: PaneInfo): boolean => {
  const inFront = !(pane.program.shell || pane.program.agent);

  return pane.status === 'working' || inFront;
};

const paneActivity = (world: GitWorld, before: Readonly<Record<string, boolean>>): PaneActivity => {
  const spaces = spaceByTab(world);
  const busy: Record<string, boolean> = {};
  const finished = new Set<string>();

  for (const pane of world.panes) {
    const space = spaces.get(pane.tab);

    if (pane.terminal === null || space === undefined) {
      continue;
    }

    const active = isBusy(pane);

    busy[pane.pane] = active;

    if (before[pane.pane] === true && !active) {
      finished.add(space.id);
    }
  }

  return { busy, finished };
};

const readyMachines = (world: GitWorld): Record<string, boolean> => {
  const ready: Record<string, boolean> = {};

  for (const machine of world.machines) {
    ready[machine.name ?? ''] = machine.layout === 'ready';
  }

  return ready;
};

const repositoryKeyOf = (facts: GitFacts, key: string): string | null => {
  const place = facts.places[key];

  if (place?.kind !== 'repository') {
    return null;
  }

  return facts.worktrees[place.worktree]?.repository.key ?? null;
};

const addUnread = (context: DueContext): void => {
  for (const key of Object.keys(context.live)) {
    if (!Object.hasOwn(context.input.reads, key)) {
      context.due.set(key, 'refresh');
    }
  }
};

const addMoved = (context: DueContext): void => {
  for (const [id, place] of Object.entries(context.places)) {
    const previous = context.input.state.places[id];

    if (previous === undefined || previous.key === place.key) {
      continue;
    }

    if (Object.hasOwn(context.live, place.key)) {
      context.due.set(place.key, 'refresh');
    }
  }
};

const addFinished = (context: DueContext, finished: ReadonlySet<string>): void => {
  for (const id of finished) {
    const place = context.places[id];

    if (place === undefined || !Object.hasOwn(context.live, place.key)) {
      continue;
    }

    const repository = repositoryKeyOf(context.input.facts, place.key);

    for (const key of Object.keys(context.live)) {
      const sameRepository =
        repository !== null && repositoryKeyOf(context.input.facts, key) === repository;

      if (key === place.key || sameRepository) {
        context.due.set(key, 'refresh');
      }
    }
  }
};

const addReturned = (context: DueContext, ready: Readonly<Record<string, boolean>>): void => {
  for (const [name, isReady] of Object.entries(ready)) {
    if (!isReady || context.input.state.ready[name] !== false) {
      continue;
    }

    for (const place of Object.values(context.places)) {
      const onMachine = (place.machine ?? '') === name;

      if (onMachine && Object.hasOwn(context.live, place.key)) {
        context.due.set(place.key, 'refresh');
      }
    }
  }
};

const needsMappingCheck = (
  facts: GitFacts,
  representatives: ReadonlyMap<string, string>,
  live: Readonly<Record<string, Place>>,
  key: string,
): boolean => {
  const place = facts.places[key];

  if (place?.kind !== 'repository') {
    return false;
  }

  if (representatives.get(place.worktree) === key) {
    return false;
  }

  const worktree = facts.worktrees[place.worktree];
  const observed = live[key];

  if (worktree === undefined || observed === undefined) {
    return false;
  }

  return observed.folder !== worktree.root;
};

const fallbackReason = (
  context: DueContext,
  representatives: ReadonlyMap<string, string>,
  key: string,
  memory: ReadMemory,
): ReadReason | null => {
  if (memory.failure) {
    return 'refresh';
  }

  const place = context.input.facts.places[key];

  if (place === undefined) {
    return null;
  }

  if (place.kind === 'none') {
    return 'refresh';
  }

  if (place.kind !== 'repository') {
    return null;
  }

  if (representatives.get(place.worktree) === key) {
    return 'refresh';
  }

  const { facts } = context.input;
  const mapping = needsMappingCheck(facts, representatives, context.live, key);

  return mapping ? 'mapping' : null;
};

const addFallbacks = (context: DueContext): void => {
  const { facts, reads } = context.input;
  const representatives = worktreeRepresentatives(facts.places, context.live);

  for (const key of Object.keys(context.live)) {
    const memory = reads[key];
    const stale = memory !== undefined && context.now - memory.lastReadAt > staleReadMilliseconds;

    if (memory === undefined || !stale || context.due.has(key)) {
      continue;
    }

    const reason = fallbackReason(context, representatives, key, memory);

    if (reason !== null) {
      context.due.set(key, reason);
    }
  }
};

export const duePlaces = (
  input: DueInput,
  world: GitWorld,
  observed: PlaceObservation,
  now: number,
): DueResult => {
  const activity = paneActivity(world, input.state.busy);
  const ready = readyMachines(world);

  const context: DueContext = {
    input,
    places: observed.bySpace,
    live: observed.byKey,
    due: new Map(),
    now,
  };

  addUnread(context);
  addMoved(context);
  addFinished(context, activity.finished);
  addReturned(context, ready);
  addFallbacks(context);

  return { due: context.due, state: { places: observed.bySpace, busy: activity.busy, ready } };
};
