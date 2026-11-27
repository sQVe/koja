import { describe, expect, test } from 'bun:test';

import { paneOf, pickerData, spaceOf, tabOf } from '../../../tests/pickerFixtures.ts';
import type { PickerData } from './rows.ts';
import { buildRows } from './rows.ts';

const countedTerminals = (): {
  terminals: unknown[];
  reads: () => number;
  reset: () => void;
} => {
  let reads = 0;

  const record = new Proxy(
    { address: 't-unrelated', parent: null, status: null, labels: { 'tau.task': 'other' } },
    {
      get: (target, key, receiver) => {
        reads += 1;

        return Reflect.get(target, key, receiver) as unknown;
      },
    },
  );

  return {
    terminals: [record],
    reads: () => reads,
    reset: () => {
      reads = 0;
    },
  };
};

const dataWithPanes = (paneCount: number, terminals: unknown[]): PickerData =>
  pickerData(
    {
      spaces: [spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true)])],
      panes: Array.from({ length: paneCount }, (_, index) => ({
        ...paneOf(`p${index + 1}`, 'k1'),
        title: `needle ${index + 1}`,
      })),
    },
    terminals,
  );

describe('buildRows search cost', () => {
  test('more searchable panes do not multiply reads of unrelated terminal records', () => {
    const counter = countedTerminals();
    const one = dataWithPanes(1, counter.terminals);

    counter.reset();
    buildRows('needle', null, one);
    const oneReads = counter.reads();

    const many = dataWithPanes(5, counter.terminals);

    counter.reset();
    buildRows('needle', null, many);
    const manyReads = counter.reads();

    expect(manyReads).toBe(oneReads);
  });
});
