import type { PaneInfo, SpaceInfo, machines } from 'herdr';

import type { Place } from './gitIdentity.ts';
import { placesOf } from './places.ts';
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

export interface DueResult {
  due: Set<string>;
  state: DueState;
}

interface PaneActivity {
  busy: Record<string, boolean>;
  finished: Set<string>;
}

interface DueContext {
  input: DueInput;
  places: Record<string, Place>;
  live: ReadonlySet<string>;
  due: Set<string>;
  now: number;
}

const fallbackMilliseconds = 60_000;

export const emptyDueState = (): DueState => ({ places: {}, busy: {}, ready: {} });

export const livePlaceKeys = (places: Readonly<Record<string, Place>>): Set<string> => {
  const keys = new Set<string>();

  for (const place of Object.values(places)) {
    if (place.folder !== '') {
      keys.add(place.key);
    }
  }

  return keys;
};

export const worktreeRepresentatives = (
  places: Readonly<Record<string, PlaceGit>>,
  live: ReadonlySet<string>,
): Map<string, string> => {
  const representatives = new Map<string, string>();

  for (const [key, place] of Object.entries(places)) {
    if (!live.has(key) || place.kind !== 'repository') {
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
  for (const key of context.live) {
    if (!Object.hasOwn(context.input.reads, key)) {
      context.due.add(key);
    }
  }
};

const addMoved = (context: DueContext): void => {
  for (const [id, place] of Object.entries(context.places)) {
    const previous = context.input.state.places[id];

    if (previous === undefined || previous.key === place.key) {
      continue;
    }

    if (context.live.has(place.key)) {
      context.due.add(place.key);
    }
  }
};

const addFinished = (context: DueContext, finished: ReadonlySet<string>): void => {
  for (const id of finished) {
    const place = context.places[id];

    if (place === undefined || !context.live.has(place.key)) {
      continue;
    }

    const repository = repositoryKeyOf(context.input.facts, place.key);

    for (const key of context.live) {
      const sameRepository =
        repository !== null && repositoryKeyOf(context.input.facts, key) === repository;

      if (key === place.key || sameRepository) {
        context.due.add(key);
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

      if (onMachine && context.live.has(place.key)) {
        context.due.add(place.key);
      }
    }
  }
};

const addFallbacks = (context: DueContext): void => {
  const { facts, reads } = context.input;
  const representatives = worktreeRepresentatives(facts.places, context.live);

  for (const key of context.live) {
    const memory = reads[key];
    const stale = memory !== undefined && context.now - memory.lastReadAt > fallbackMilliseconds;

    if (memory === undefined || !stale) {
      continue;
    }

    if (memory.failure) {
      context.due.add(key);

      continue;
    }

    const place = facts.places[key];

    if (place === undefined) {
      continue;
    }

    if (place.kind === 'none') {
      context.due.add(key);

      continue;
    }

    if (place.kind === 'repository' && representatives.get(place.worktree) === key) {
      context.due.add(key);
    }
  }
};

export const duePlaces = (input: DueInput, world: GitWorld, now: number): DueResult => {
  const places = placesOf(world.spaces, world.panes);
  const live = livePlaceKeys(places);
  const activity = paneActivity(world, input.state.busy);
  const ready = readyMachines(world);
  const context: DueContext = { input, places, live, due: new Set(), now };

  addUnread(context);
  addMoved(context);
  addFinished(context, activity.finished);
  addReturned(context, ready);
  addFallbacks(context);

  return { due: context.due, state: { places, busy: activity.busy, ready } };
};
