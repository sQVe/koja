import { describe, expect, test } from 'bun:test';

import type { SpaceCommand } from '../spaceOrder.ts';
import { readSpaceSelection, runSpaceCommand } from './spaceSelection.ts';

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

describe('space selection', () => {
  test('reads back the selection that was written', () => {
    const store = memoryStore();

    runSpaceCommand({ run: () => undefined, get: store.get, set: store.set }, select('notes'));

    expect(readSpaceSelection(store.get)).toEqual({ version: 1, count: 1, id: 'notes' });
  });

  test('counts up from the previous selection', () => {
    const store = memoryStore();
    const deps = { run: () => undefined, get: store.get, set: store.set };

    runSpaceCommand(deps, select('notes'));
    runSpaceCommand(deps, select('main'));

    expect(readSpaceSelection(store.get)).toEqual({ version: 1, count: 2, id: 'main' });
  });

  test('records no selected id for a space step', () => {
    const store = memoryStore();

    runSpaceCommand({ run: () => undefined, get: store.get, set: store.set }, step);

    expect(readSpaceSelection(store.get)).toEqual({ version: 1, count: 1, id: null });
  });

  test('writes the record before it runs the command', () => {
    const store = memoryStore();
    let seen: unknown = null;

    runSpaceCommand(
      {
        run: () => {
          seen = store.values['spaces.selection'];
        },
        get: store.get,
        set: store.set,
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
    ['the id is not a string or null', { version: 1, count: 1, id: 3 }],
  ];

  test.each(malformed)('reads no selection when %s', (_name, value) => {
    expect(readSpaceSelection(() => value)).toBeNull();
  });
});
