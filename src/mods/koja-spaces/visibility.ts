// Which spaces the sidebar shows: one that git answered for, or one that has waited long enough
// that it is shown where it is rather than jumping under its repository later.

export interface VisibilityState {
  shown: Set<string>;
  born: Record<string, number>;
}

interface VisibilitySpace {
  id: string;
  // The space's place key, which git answers for.
  key: string;
}

export interface VisibilityInput {
  spaces: readonly VisibilitySpace[];
  answered: ReadonlySet<string>;
  time: number;
}

export interface VisibilityResult extends VisibilityState {
  // True when this transition showed a space that was hidden, so another redraw is due.
  changed: boolean;
  // True while some space has not been shown yet, so another redraw is due.
  waiting: boolean;
}

// A new space waits at most this long for its git before it shows anyway.
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

  // Spaces that are gone are pruned from both sets.
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
