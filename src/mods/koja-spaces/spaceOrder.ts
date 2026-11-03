import type { SpaceOrder } from '../../kit/spaceOrder.ts';
import { clearSpaceOrder, writeSpaceOrder } from '../../kit/spaceOrder.ts';
import type { TreeRow } from './tree.ts';
import { listedOf } from './tree.ts';

export interface OrderPublisher {
  publish: (rows: readonly TreeRow[], liveIds: readonly string[]) => void;
  clear: () => void;
}

const hiddenIds = (shown: readonly string[], liveIds: readonly string[]): string[] =>
  liveIds.filter((id) => !shown.includes(id));

// Herdr re-renders every mod on each shared write, so an unchanged order must not be written again.
export const createOrderPublisher = (
  set: (key: string, value: unknown) => void,
): OrderPublisher => {
  let published: string | null = null;

  return {
    publish: (rows, liveIds) => {
      const shown = rows.map((row) => listedOf(row).space.id);
      const order: SpaceOrder = { shown, hidden: hiddenIds(shown, liveIds) };
      const serialized = JSON.stringify(order);

      if (serialized === published) {
        return;
      }

      published = serialized;
      writeSpaceOrder(set, order);
    },
    clear: () => {
      published = null;
      clearSpaceOrder(set);
    },
  };
};
