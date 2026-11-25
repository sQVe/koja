import { recordOf } from '../fields.ts';
import type { SpaceCommand } from '../spaceOrder.ts';

export interface SpaceSelection {
  version: 1;
  count: number;
  id: string | null;
}

export interface SpaceSelectionStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  shown: () => string | null;
}

export interface SpaceSelectionDeps extends SpaceSelectionStore {
  run: (command: string, args?: Record<string, unknown>) => void;
}

const spaceSelectionKey = 'spaces.selection';

const isSpaceSelection = (value: unknown): value is SpaceSelection => {
  const record = recordOf(value);
  const count = record['count'];
  const id = record['id'];

  const validCount = typeof count === 'number' && Number.isInteger(count) && count >= 0;
  const validId = id === null || typeof id === 'string';

  return record['version'] === 1 && validCount && validId;
};

export const readSpaceSelection = (get: (key: string) => unknown): SpaceSelection | null => {
  const value = get(spaceSelectionKey);

  if (!isSpaceSelection(value)) {
    return null;
  }

  return { version: 1, count: value.count, id: value.id };
};

const selectedId = (command: SpaceCommand): string | null => {
  if (command.name !== 'space.select') {
    return null;
  }

  const id = command.args?.['id'];

  return typeof id === 'string' ? id : null;
};

export const recordSpaceSelection = (store: SpaceSelectionStore, id: string): void => {
  if (id === store.shown()) {
    return;
  }

  const previous = readSpaceSelection(store.get);

  store.set(spaceSelectionKey, {
    version: 1,
    count: (previous?.count ?? 0) + 1,
    id,
  });
};

export const runSpaceCommand = (deps: SpaceSelectionDeps, command: SpaceCommand): void => {
  const id = selectedId(command);

  if (id !== null) {
    recordSpaceSelection(deps, id);
  }

  deps.run(command.name, command.args);
};

export const selectionMoved = (
  before: SpaceSelection | null,
  after: SpaceSelection | null,
  closedId: string | null,
  liveIds: readonly string[],
): boolean => {
  if (after === null) {
    return false;
  }

  if (after.id === null) {
    return false;
  }

  const countChanged = before?.count !== after.count;

  return countChanged && after.id !== closedId && liveIds.includes(after.id);
};
