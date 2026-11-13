// One project's spaces below its header, in Herdr's order, folded ones included.
export type ProjectChildren = readonly string[];

// The index is the one-based place the space ends at in Herdr's whole order.
export interface SpaceMove {
  id: string;
  index: number;
}

const childrenWith = (
  projects: readonly ProjectChildren[],
  source: string,
  target: string,
): ProjectChildren | null =>
  projects.find((children) => children.includes(source) && children.includes(target)) ?? null;

export const canDrop = (
  projects: readonly ProjectChildren[],
  source: string,
  target: string,
): boolean => source === target || childrenWith(projects, source, target) !== null;

const movedChildren = (children: ProjectChildren, source: string, target: string): string[] => {
  const rest = children.filter((id) => id !== source);

  rest.splice(children.indexOf(target), 0, source);

  return rest;
};

const wantedOrder = (
  order: readonly string[],
  children: ProjectChildren,
  wanted: readonly string[],
): string[] => {
  const queue = [...wanted];

  return order.map((id) => (children.includes(id) ? (queue.shift() ?? id) : id));
};

const risingRun = (values: readonly number[]): Set<number> => {
  const lengths: number[] = [];
  const previous: number[] = [];

  values.forEach((value, index) => {
    let best = -1;

    values.slice(0, index).forEach((earlier, before) => {
      const longer = (lengths[before] ?? 0) > (lengths[best] ?? 0);

      if (earlier < value && longer) {
        best = before;
      }
    });

    lengths.push((lengths[best] ?? 0) + 1);
    previous.push(best);
  });

  const run = new Set<number>();
  let at = lengths.indexOf(Math.max(...lengths));

  while (at !== -1) {
    run.add(at);
    at = previous[at] ?? -1;
  }

  return run;
};

const movesBetween = (order: readonly string[], wanted: readonly string[]): SpaceMove[] => {
  const kept = risingRun(order.map((id) => wanted.indexOf(id)));
  const keptIds = new Set(order.filter((_id, index) => kept.has(index)));
  const current = [...order];
  const moves: SpaceMove[] = [];

  wanted.forEach((id, place) => {
    if (keptIds.has(id)) {
      return;
    }

    current.splice(current.indexOf(id), 1);

    const after = current.indexOf(wanted[place - 1] ?? '');

    current.splice(after + 1, 0, id);
    moves.push({ id, index: after + 2 });
  });

  return moves;
};

export const dropMoves = (
  order: readonly string[],
  projects: readonly ProjectChildren[],
  source: string,
  target: string,
): SpaceMove[] => {
  const children = childrenWith(projects, source, target);

  if (children === null) {
    return [];
  }

  const wanted = wantedOrder(order, children, movedChildren(children, source, target));

  return movesBetween(order, wanted);
};
