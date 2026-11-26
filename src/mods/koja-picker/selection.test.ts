import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

let sharedValues: Record<string, unknown> = {};
let writes: [string, unknown][] = [];

Object.assign(globalThis, { kojaModName: 'koja-picker' });

await mock.module('herdr', () =>
  herdrFake({
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;
      writes.push([key, value]);

      return null;
    },
    shared: (key: string) => sharedValues[key],
  }),
);

const { stringOf } = await import('../../kit/fields.ts');

await mock.module('../../kit/index.ts', () => kitIndexFake({ modName: 'koja-picker', stringOf }));

const modulePath = './selection.ts';

const { clearSelection, readSelection, writeSelection } = (await import(modulePath)) as {
  readSelection: (overlay: string) => string | null;
  writeSelection: (overlay: string, pane: string | null) => void;
  clearSelection: (overlay: string) => void;
};

const overlay = 'overlay-1';
const key = `koja-picker.selection.${overlay}`;

const publish = (pane: string | null): void => {
  writeSelection(overlay, pane);
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  sharedValues = {};
  writes = [];
});

describe('selection', () => {
  test('publishes a changed pane once', () => {
    publish('p1');
    publish('p1');
    publish('p2');

    expect(writes).toEqual([
      [key, 'p1'],
      [key, 'p2'],
    ]);

    expect(readSelection(overlay)).toBe('p2');
  });

  test('publishes nothing when the picker opens on no pane', () => {
    publish(null);

    expect(writes).toEqual([]);
  });

  test('keeps the selection of each popup apart', () => {
    writeSelection('overlay-a', 'first-pane');
    writeSelection('overlay-b', 'second-pane');
    writeSelection('overlay-b', null);

    expect(readSelection('overlay-a')).toBe('first-pane');
    expect(readSelection('overlay-b')).toBeNull();
  });

  test('a closed popup clears its own selection and leaves the other popup alone', () => {
    writeSelection('overlay-a', 'first-pane');
    writeSelection('overlay-b', 'second-pane');

    clearSelection('overlay-b');

    expect(readSelection('overlay-b')).toBeNull();
    expect(readSelection('overlay-a')).toBe('first-pane');
  });

  test('publishes one write per change of the pane it is given', () => {
    const walks: (string | null)[][] = [
      ['p1', 'p1', 'p2', 'p1', 'p1'],
      ['p2', 'p1', 'p1', 'p2', 'p3'],
      ['p1', 'p2', 'p3', 'p3', 'p3'],
      [null, 'p1', null, null, 'p2'],
    ];

    for (const walk of walks) {
      sharedValues = {};
      writes = [];

      for (const pane of walk) {
        publish(pane);
      }

      const changes = walk.filter((pane, index) => pane !== (index === 0 ? null : walk[index - 1]));

      expect(writes).toEqual(changes.map((pane) => [key, pane]));
    }
  });

  test('clears the published pane when the selected row has none', () => {
    publish('p1');
    publish(null);

    expect(readSelection(overlay)).toBeNull();
  });
});
