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

const { readSelection, writeSelection } = (await import(modulePath)) as {
  readSelection: () => string | null;
  writeSelection: (pane: string | null) => void;
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
    writeSelection('p1');
    writeSelection('p1');
    writeSelection('p2');

    expect(writes).toEqual([
      ['koja-picker.selection', 'p1'],
      ['koja-picker.selection', 'p2'],
    ]);

    expect(readSelection()).toBe('p2');
  });

  test('publishes nothing when the picker opens on no pane', () => {
    writeSelection(null);

    expect(writes).toEqual([]);
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
        writeSelection(pane);
      }

      const changes = walk.filter((pane, index) => pane !== (index === 0 ? null : walk[index - 1]));

      expect(writes).toEqual(changes.map((pane) => ['koja-picker.selection', pane]));
    }
  });

  test('clears the published pane when the selected row has none', () => {
    writeSelection('p1');
    writeSelection(null);

    expect(readSelection()).toBeNull();
  });
});
