import { recordOf } from './fields.ts';

export interface SpaceOrder {
  shown: string[];
  hidden: string[];
  roots: string[];
}

export interface LiveSpaceFacts {
  order: SpaceOrder | null;
  liveIds: readonly string[];
}

export interface SpaceStepFacts extends LiveSpaceFacts {
  current: string | null;
}

export interface SpaceCloseFacts extends LiveSpaceFacts {
  closedId: string | null;
}

export interface SpaceCommand {
  name: string;
  args?: Record<string, unknown>;
}

const spaceOrderKey = 'spaces.order';

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isSpaceOrder = (value: unknown): value is SpaceOrder => {
  const record = recordOf(value);

  return isIdList(record['shown']) && isIdList(record['hidden']) && isIdList(record['roots']);
};

export const readSpaceOrder = (get: (key: string) => unknown): SpaceOrder | null => {
  const value = get(spaceOrderKey);

  if (!isSpaceOrder(value)) {
    return null;
  }

  return { shown: [...value.shown], hidden: [...value.hidden], roots: [...value.roots] };
};

export const writeSpaceOrder = (
  set: (key: string, value: unknown) => void,
  order: SpaceOrder,
): void => {
  set(spaceOrderKey, {
    shown: [...order.shown],
    hidden: [...order.hidden],
    roots: [...order.roots],
  });
};

export const clearSpaceOrder = (set: (key: string, value: unknown) => void): void => {
  set(spaceOrderKey, null);
};

const hasUnlistedSpace = (order: SpaceOrder, liveIds: readonly string[]): boolean =>
  liveIds.some((id) => !order.shown.includes(id) && !order.hidden.includes(id));

const liveOrder = (facts: LiveSpaceFacts): SpaceOrder | null => {
  const order = facts.order;

  if (order === null || hasUnlistedSpace(order, facts.liveIds)) {
    return null;
  }

  const live = new Set(facts.liveIds);

  return { ...order, shown: order.shown.filter((id) => live.has(id)) };
};

export const visibleSpaceIds = (facts: LiveSpaceFacts): readonly string[] =>
  liveOrder(facts)?.shown ?? facts.liveIds;

const targetSpace = (order: SpaceOrder, current: string | null, step: number): string | null => {
  const shown = order.shown;
  const index = current === null ? -1 : shown.indexOf(current);

  if (index !== -1) {
    return shown[(index + step + shown.length) % shown.length] ?? null;
  }

  const currentHidden = current !== null && order.hidden.includes(current);

  if (!currentHidden) {
    return null;
  }

  return (step > 0 ? shown[0] : shown.at(-1)) ?? null;
};

export const spaceStepCommand = (step: number, facts: SpaceStepFacts): SpaceCommand | null => {
  const order = liveOrder(facts);
  const target = order === null ? null : targetSpace(order, facts.current, step);

  if (target === null) {
    return { name: step > 0 ? 'space.next' : 'space.prev' };
  }

  if (target === facts.current) {
    return null;
  }

  return { name: 'space.select', args: { id: target } };
};

const nearestLiveBefore = (
  shown: readonly string[],
  index: number,
  live: ReadonlySet<string>,
): string | null => shown.slice(0, index).findLast((id) => live.has(id)) ?? null;

const nearestLiveAfter = (
  shown: readonly string[],
  index: number,
  live: ReadonlySet<string>,
): string | null => shown.slice(index + 1).find((id) => live.has(id)) ?? null;

// The order still lists the closed space, so its place there gives the row to show next.
export const closedSpaceCommand = (facts: SpaceCloseFacts): SpaceCommand | null => {
  const order = facts.order;
  const closedId = facts.closedId;

  if (order === null || closedId === null) {
    return null;
  }

  if (facts.liveIds.includes(closedId)) {
    return null;
  }

  const index = order.shown.indexOf(closedId);

  if (index === -1) {
    return null;
  }

  const live = new Set(facts.liveIds);
  const above = nearestLiveBefore(order.shown, index, live);
  const target = above ?? nearestLiveAfter(order.shown, index, live);

  if (target === null) {
    return null;
  }

  return { name: 'space.select', args: { id: target } };
};

const placeIn = (ids: readonly (string | null)[], id: string | null): number => ids.indexOf(id);

const targetRoot = (order: SpaceOrder, current: string | null, step: number): string | null => {
  const place = placeIn(order.shown, current);

  if (place === -1 && placeIn(order.hidden, current) === -1) {
    return null;
  }

  const roots = order.shown.filter((id) => order.roots.includes(id));

  if (step > 0) {
    return roots.find((id) => order.shown.indexOf(id) > place) ?? roots[0] ?? null;
  }

  return roots.findLast((id) => order.shown.indexOf(id) < place) ?? roots.at(-1) ?? null;
};

export const rootStepCommand = (step: number, facts: SpaceStepFacts): SpaceCommand | null => {
  const order = liveOrder(facts);

  if (order === null) {
    return null;
  }

  const target = targetRoot(order, facts.current, step);

  if (target === null || target === facts.current) {
    return null;
  }

  return { name: 'space.select', args: { id: target } };
};
