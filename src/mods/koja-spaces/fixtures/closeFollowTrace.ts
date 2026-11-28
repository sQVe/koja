import { pick, seededRandom } from '../../../../tests/seeded.ts';

type TraceObserver = 'draw' | 'timer';

interface TraceLook {
  live: string[];
  active: string;
  picked: string | null;
  pending: string | null;
  observer: TraceObserver;
}

export interface TraceStep {
  live: string[];
  active: string;
  picked: string | null;
  pendingBefore: string | null;
  observer: TraceObserver;
  order: string[];
  closedId: string | null;
  expected: string[];
}

export interface Trace {
  first: { live: string[]; active: string };
  steps: TraceStep[];
}

const lookSpaceIds = ['a', 'b', 'c', 'd', 'e'];

const lookCount = 10;

const closeChance = 0.25;

const keepFocusChance = 0.5;

const pickChance = 0.4;

const landsNowChance = 0.5;

const timerChance = 0.4;

const liveAfter = (live: readonly string[], random: () => number): string[] => {
  const kept = live.filter(() => random() > closeChance);

  if (kept.length > 0) {
    return kept;
  }

  return [pick(live, random)];
};

const nextLook = (previous: TraceLook, random: () => number): TraceLook => {
  const live = liveAfter(previous.live, random);

  const pickAllowed = previous.pending === null && random() < pickChance;
  const candidate = pickAllowed ? pick(live, random) : null;

  const picked = candidate === previous.active ? null : candidate;
  const landsNow = picked !== null && random() < landsNowChance;

  const landed =
    previous.pending !== null && live.includes(previous.pending) ? previous.pending : null;

  const keepsFocus = live.includes(previous.active) && random() < keepFocusChance;
  const nextFocus = keepsFocus ? previous.active : pick(live, random);
  const active = picked !== null && landsNow ? picked : (landed ?? nextFocus);
  const pending = picked !== null && !landsNow && active !== picked ? picked : null;
  const observer: TraceObserver = random() < timerChance ? 'timer' : 'draw';

  return { live, active, picked, pending, observer };
};

const nearestLiveNeighbour = (
  order: readonly string[],
  closedId: string,
  live: readonly string[],
): string | null => {
  const index = order.indexOf(closedId);

  if (index === -1) {
    return null;
  }

  const above = order.slice(0, index).findLast((id) => live.includes(id));

  return above ?? order.slice(index + 1).find((id) => live.includes(id)) ?? null;
};

const expectationFor = (
  previous: TraceLook,
  look: TraceLook,
  order: readonly string[],
): { closedId: string | null; selection: string[] } => {
  const closedId = look.live.includes(previous.active) ? null : previous.active;

  if (closedId === null) {
    return { closedId, selection: [] };
  }

  const pendingBefore = previous.pending;

  const pendingBlocks =
    pendingBefore !== null && pendingBefore !== closedId && look.live.includes(pendingBefore);

  const picked = look.picked;

  const userPickedLiveSpace =
    picked !== null && picked !== previous.active && look.live.includes(picked);

  if (pendingBlocks || userPickedLiveSpace) {
    return { closedId, selection: [] };
  }

  const target = nearestLiveNeighbour(order, closedId, look.live);

  return { closedId, selection: target === null ? [] : [target] };
};

// The order a look publishes is the last drawn one, so a timer observation keeps it.
export const closeTrace = (seed: number): Trace => {
  const random = seededRandom(seed);
  const start = { live: [...lookSpaceIds], active: pick(lookSpaceIds, random) };

  const steps: TraceStep[] = [];
  let previous: TraceLook = { ...start, picked: null, pending: null, observer: 'draw' };
  let order = start.live;

  for (let step = 0; step < lookCount; step += 1) {
    const look = nextLook(previous, random);
    const { closedId, selection } = expectationFor(previous, look, order);

    steps.push({
      live: look.live,
      active: look.active,
      picked: look.picked,
      pendingBefore: previous.pending,
      observer: look.observer,
      order,
      closedId,
      expected: selection,
    });

    order = look.observer === 'draw' ? look.live : order;
    previous = look;
  }

  return { first: start, steps };
};
