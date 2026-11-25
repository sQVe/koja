import { describe, expect, test } from 'bun:test';

import type { SpaceCommand } from '../spaceOrder.ts';
import type { SpaceSelection } from './spaceSelection.ts';
import { readSpaceSelection, runSpaceCommand, selectionMoved } from './spaceSelection.ts';

interface MovedCase {
  name: string;
  before: SpaceSelection | null;
  after: SpaceSelection | null;
  closedId: string | null;
  liveIds: readonly string[];
  moved: boolean;
}

const memoryStore = () => {
  const values: Record<string, unknown> = {};

  return {
    values,
    get: (key: string): unknown => values[key],
    set: (key: string, value: unknown): void => {
      values[key] = value;
    },
  };
};

const select = (id: string): SpaceCommand => ({ name: 'space.select', args: { id } });

const step: SpaceCommand = { name: 'space.next' };

const depsWith = (store: ReturnType<typeof memoryStore>, shown: string | null = null) => ({
  run: () => undefined,
  get: store.get,
  set: store.set,
  shown: () => shown,
});

describe('space selection', () => {
  test('reads back the selection that was written', () => {
    const store = memoryStore();

    runSpaceCommand(depsWith(store), select('notes'));

    expect(readSpaceSelection(store.get)).toEqual({ version: 1, count: 1, id: 'notes' });
  });

  test('counts up from the previous selection', () => {
    const store = memoryStore();
    const deps = depsWith(store);

    runSpaceCommand(deps, select('notes'));
    runSpaceCommand(deps, select('main'));

    expect(readSpaceSelection(store.get)).toEqual({ version: 1, count: 2, id: 'main' });
  });

  test('records no selected id for a space step', () => {
    const store = memoryStore();

    runSpaceCommand(depsWith(store), step);

    expect(readSpaceSelection(store.get)).toEqual({ version: 1, count: 1, id: null });
  });

  test('records nothing when the command selects the space already shown', () => {
    const store = memoryStore();

    runSpaceCommand(depsWith(store, 'notes'), select('notes'));

    expect(readSpaceSelection(store.get)).toBeNull();
  });

  test('writes the record before it runs the command', () => {
    const store = memoryStore();
    let seen: unknown = null;

    runSpaceCommand(
      {
        ...depsWith(store),
        run: () => {
          seen = store.values['spaces.selection'];
        },
      },
      select('notes'),
    );

    expect(seen).toEqual({ version: 1, count: 1, id: 'notes' });
  });

  test('reads no selection when nothing was written', () => {
    expect(readSpaceSelection(memoryStore().get)).toBeNull();
  });

  const malformed: [string, unknown][] = [
    ['the value is not an object', 'notes'],
    ['the version is not one', { version: 2, count: 1, id: 'notes' }],
    ['the count is missing', { version: 1, id: 'notes' }],
    ['the count is not a whole number', { version: 1, count: 1.5, id: 'notes' }],
    ['the count is negative', { version: 1, count: -1, id: 'notes' }],
    ['the id is not a string or null', { version: 1, count: 1, id: 3 }],
  ];

  test.each(malformed)('reads no selection when %s', (_name, value) => {
    expect(readSpaceSelection(() => value)).toBeNull();
  });
});

const selectionLabel = (selection: SpaceSelection | null): string =>
  selection === null ? 'no record' : `count ${selection.count} of ${selection.id ?? 'none'}`;

const movedByRule = (
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

const selection = (count: number, id: string | null): SpaceSelection => ({
  version: 1,
  count,
  id,
});

const beforeRecords = [null, selection(1, 'a'), selection(1, 'b'), selection(2, 'a')];

const afterRecords = [
  null,
  selection(1, null),
  selection(1, 'a'),
  selection(2, 'a'),
  selection(2, 'b'),
  selection(3, 'gone'),
];

const closedIds = [null, 'a', 'b'];

const liveLists = [['a', 'b'], ['b']];

const movedCases: MovedCase[] = beforeRecords.flatMap((before) =>
  afterRecords.flatMap((after) =>
    closedIds.flatMap((closedId) =>
      liveLists.map((liveIds) => ({
        name: `${selectionLabel(before)} then ${selectionLabel(after)}, closed ${closedId ?? 'none'}, live ${liveIds.join(',')}`,
        before,
        after,
        closedId,
        liveIds,
        moved: movedByRule(before, after, closedId, liveIds),
      })),
    ),
  ),
);

describe('selectionMoved', () => {
  test.each(movedCases)(
    'reports moved=$moved for $name',
    ({ before, after, closedId, liveIds, moved }) => {
      expect(selectionMoved(before, after, closedId, liveIds)).toBe(moved);
    },
  );
});
