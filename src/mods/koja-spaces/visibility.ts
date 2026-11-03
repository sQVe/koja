export interface VisibilityState {
  shown: Set<string>;
  born: Record<string, number>;
}

interface VisibilitySpace {
  id: string;
  key: string;
}

export interface VisibilityInput {
  spaces: readonly VisibilitySpace[];
  answered: ReadonlySet<string>;
  time: number;
}

export interface VisibilityResult extends VisibilityState {
  changed: boolean;
  waiting: boolean;
}

export const newSpaceWait = 1500;

export const initialVisibility = (ids: Iterable<string>): VisibilityState => ({
  shown: new Set(ids),
  born: {},
});

export const advanceVisibility = (
  state: VisibilityState,
  input: VisibilityInput,
): VisibilityResult => {
  const live = new Set(input.spaces.map((space) => space.id));

  const shown = new Set([...state.shown].filter((id) => live.has(id)));
  const born = Object.fromEntries(Object.entries(state.born).filter(([id]) => live.has(id)));

  for (const space of input.spaces) {
    if (shown.has(space.id)) {
      continue;
    }

    if (input.answered.has(space.key)) {
      shown.add(space.id);

      continue;
    }

    const first = born[space.id] ?? input.time;

    born[space.id] = first;

    if (input.time - first > newSpaceWait) {
      shown.add(space.id);
    }
  }

  return {
    shown,
    born,
    changed: [...shown].some((id) => !state.shown.has(id)),
    waiting: input.spaces.some((space) => !shown.has(space.id)),
  };
};
