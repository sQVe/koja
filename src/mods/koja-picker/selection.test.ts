import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

let sharedValues: Record<string, unknown> = {};
let writes: string[] = [];

Object.assign(globalThis, { kojaModName: 'koja-picker' });

await mock.module('herdr', () =>
  herdrFake({
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;
      writes.push(key);

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

    expect(writes).toEqual(['koja-picker.selection', 'koja-picker.selection']);
    expect(readSelection()).toBe('p2');
  });

  test('clears the published pane when the selected row has none', () => {
    writeSelection('p1');
    writeSelection(null);

    expect(readSelection()).toBeNull();
  });
});
