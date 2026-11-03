import { describe, expect, test } from 'bun:test';

import { clearSpaceOrder, readSpaceOrder, writeSpaceOrder } from './spaceOrder.ts';

const memoryStore = () => {
  const values: Record<string, unknown> = {};

  return {
    get: (key: string): unknown => values[key],
    set: (key: string, value: unknown): void => {
      values[key] = value;
    },
  };
};

describe('space order', () => {
  test('reads back the shown and hidden ids that were written', () => {
    const store = memoryStore();

    writeSpaceOrder(store.set, { shown: ['main', 'worktree'], hidden: ['folded'] });

    expect(readSpaceOrder(store.get)).toEqual({ shown: ['main', 'worktree'], hidden: ['folded'] });
  });

  test('reads no order after the published order is cleared', () => {
    const store = memoryStore();

    writeSpaceOrder(store.set, { shown: ['main'], hidden: [] });
    clearSpaceOrder(store.set);

    expect(readSpaceOrder(store.get)).toBeNull();
  });

  test('reads no order when nothing was published', () => {
    expect(readSpaceOrder(memoryStore().get)).toBeNull();
  });

  test('reads no order when the value is not an object', () => {
    expect(readSpaceOrder(() => 'main')).toBeNull();
  });

  test('reads no order when the hidden list is missing', () => {
    expect(readSpaceOrder(() => ({ shown: ['main'] }))).toBeNull();
  });

  test('reads no order when a list holds something other than ids', () => {
    expect(readSpaceOrder(() => ({ shown: ['main', 3], hidden: [] }))).toBeNull();
  });
});
