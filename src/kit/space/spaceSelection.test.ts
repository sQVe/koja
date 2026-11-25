import { describe, expect, test } from 'bun:test';

import type { SpaceCommand } from '../spaceOrder.ts';
import type { SpaceSelection } from './spaceSelection.ts';
import { readSpaceSelection, runSpaceCommand, selectionMoved } from './spaceSelection.ts';

interface RunCall {
  name: string;
  args: Record<string, unknown> | undefined;
}

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
  const runs: RunCall[] = [];

  return {
    values,
    runs,
    get: (key: string): unknown => values[key],
    set: (key: string, value: unknown): void => {
      values[key] = value;
    },
    run: (name: string, args?: Record<string, unknown>): void => {
      runs.push({ name, args });
    },
  };
};

const select = (id: string): SpaceCommand => ({ name: 'space.select', args: { id } });

const step: SpaceCommand = { name: 'space.next' };

const depsWith = (store: ReturnType<typeof memoryStore>, shown: string | null = null) => ({
  run: store.run,
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

  test('runs the space select it records', () => {
    const store = memoryStore();

    runSpaceCommand(depsWith(store), select('notes'));

    expect(store.runs).toEqual([{ name: 'space.select', args: { id: 'notes' } }]);
  });

  test('runs a space step without clearing the recorded selection', () => {
    const store = memoryStore();
    const deps = depsWith(store);

    runSpaceCommand(deps, select('notes'));
    runSpaceCommand(deps, step);

    expect(store.runs).toEqual([
      { name: 'space.select', args: { id: 'notes' } },
      { name: 'space.next', args: undefined },
    ]);

    expect(readSpaceSelection(store.get)).toEqual({ version: 1, count: 1, id: 'notes' });
  });

  test('runs a space step without recording a selection when nothing was recorded', () => {
    const store = memoryStore();

    runSpaceCommand(depsWith(store), step);

    expect(store.runs).toEqual([{ name: 'space.next', args: undefined }]);
    expect(readSpaceSelection(store.get)).toBeNull();
  });

  test('runs a space select whose id is not a string without recording it', () => {
    const store = memoryStore();
    const invalidSelect: SpaceCommand = { name: 'space.select', args: { id: 7 } };

    runSpaceCommand(depsWith(store), invalidSelect);

    expect(store.runs).toEqual([{ name: 'space.select', args: { id: 7 } }]);
    expect(readSpaceSelection(store.get)).toBeNull();
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

  test('reads a selection whose count is zero', () => {
    const value = { version: 1, count: 0, id: 'notes' } satisfies SpaceSelection;

    expect(readSpaceSelection(() => value)).toEqual(value);
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

const selection = (count: number, id: string | null): SpaceSelection => ({
  version: 1,
  count,
  id,
});

const movedCases: MovedCase[] = [
  {
    name: 'a new live selection',
    before: selection(1, 'a'),
    after: selection(2, 'b'),
    closedId: 'c',
    liveIds: ['a', 'b'],
    moved: true,
  },
  {
    name: 'a selection of the closed space',
    before: selection(1, 'a'),
    after: selection(2, 'b'),
    closedId: 'b',
    liveIds: ['a', 'b'],
    moved: false,
  },
  {
    name: 'a step with a null id',
    before: selection(1, 'a'),
    after: selection(1, null),
    closedId: 'b',
    liveIds: ['a'],
    moved: false,
  },
  {
    name: 'the same count as the last look',
    before: selection(2, 'a'),
    after: selection(2, 'b'),
    closedId: 'c',
    liveIds: ['a', 'b'],
    moved: false,
  },
  {
    name: 'a selected space that is gone',
    before: selection(1, 'a'),
    after: selection(2, 'gone'),
    closedId: 'c',
    liveIds: ['a', 'b'],
    moved: false,
  },
  {
    name: 'no record at all',
    before: selection(1, 'a'),
    after: null,
    closedId: 'b',
    liveIds: ['a'],
    moved: false,
  },
  {
    name: 'a null id with a changed count',
    before: selection(1, 'a'),
    after: selection(2, null),
    closedId: 'b',
    liveIds: ['a'],
    moved: false,
  },
  {
    name: 'a first live selection with no earlier record',
    before: null,
    after: selection(1, 'a'),
    closedId: 'b',
    liveIds: ['a'],
    moved: true,
  },
  {
    name: 'a selection when no space was focused before',
    before: selection(1, 'a'),
    after: selection(2, 'b'),
    closedId: null,
    liveIds: ['a', 'b'],
    moved: true,
  },
];

describe('selectionMoved', () => {
  test.each(movedCases)(
    'reports moved=$moved for $name',
    ({ before, after, closedId, liveIds, moved }) => {
      expect(selectionMoved(before, after, closedId, liveIds)).toBe(moved);
    },
  );
});
