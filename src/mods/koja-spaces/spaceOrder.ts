import { sameItems } from '../../data/fields.ts';
import type { SpaceOrder } from '../../kit/spaceOrder.ts';
import { clearSpaceOrder, writeSpaceOrder } from '../../kit/spaceOrder.ts';
import type { Project } from './projects.ts';
import { rootSpaceIds, shownSpaces } from './projects.ts';

export interface OrderPublisher {
  publish: (projects: Project[], liveIds: readonly string[]) => SpaceOrder;
  published: () => SpaceOrder | null;
  clear: () => void;
}

const hiddenIds = (shown: readonly string[], liveIds: readonly string[]): string[] =>
  liveIds.filter((id) => !shown.includes(id));

const sameOrder = (left: SpaceOrder, right: SpaceOrder): boolean =>
  sameItems(left.shown, right.shown) &&
  sameItems(left.hidden, right.hidden) &&
  sameItems(left.roots, right.roots);

// Herdr re-renders every mod on each shared write, so an unchanged order must not be written again.
export const createOrderPublisher = (
  set: (key: string, value: unknown) => void,
): OrderPublisher => {
  let published: SpaceOrder | null = null;

  return {
    publish: (projects, liveIds) => {
      const shown = shownSpaces(projects).map((row) => row.space.id);
      const roots = rootSpaceIds(projects);
      const order: SpaceOrder = { shown, hidden: hiddenIds(shown, liveIds), roots };

      if (published !== null && sameOrder(order, published)) {
        return published;
      }

      published = order;
      writeSpaceOrder(set, order);

      return order;
    },
    published: () => published,
    clear: () => {
      published = null;
      clearSpaceOrder(set);
    },
  };
};
