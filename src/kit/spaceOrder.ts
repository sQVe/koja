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

  const isLive = (id: string): boolean => live.has(id);

  return {
    shown: order.shown.filter(isLive),
    hidden: order.hidden,
    roots: order.roots.filter(isLive),
  };
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

const targetRoot = (order: SpaceOrder, current: string, step: number): string | null => {
  const place = order.shown.indexOf(current);

  if (place === -1 && !order.hidden.includes(current)) {
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

  if (order === null || facts.current === null) {
    return null;
  }

  const target = targetRoot(order, facts.current, step);

  if (target === null || target === facts.current) {
    return null;
  }

  return { name: 'space.select', args: { id: target } };
};
