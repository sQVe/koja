import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementWithText } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { Fact } from './factRows.ts';
import { factSize } from './size.ts';

const palette = {
  dim: '#2d2d3d',
  foreground: '#4f4f5f',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './factRows.ts';

const { factPairs, factRows } = (await import(modulePath)) as {
  factPairs: (facts: Fact[]) => DrawnElement;
  factRows: (facts: Fact[]) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const facts: Fact[] = [
  { label: 'Project', value: 'Koja' },
  { label: 'Parent', value: 'ME-1087', link: { source: 'Linear' } },
  { label: 'Related PR', value: '#52', link: { source: 'GitHub', repository: 'koja' } },
];

const factTexts = [
  'Project',
  'Koja',
  'Parent',
  'ME-1087 · Linear',
  'Related PR',
  'koja #52 · GitHub',
];

describe('factRows', () => {
  test('rail labels take one column and the values keep the text ink', () => {
    const rows = factRows(facts);

    expect(elementWithText(rows, 'Project')?.styles['w']).toEqual([factSize.labelWidth]);
    expect(elementWithText(rows, 'Parent')?.styles['w']).toEqual([factSize.labelWidth]);
    expect(elementWithText(rows, 'Project')?.textColors).toEqual([palette.dim]);
    expect(elementWithText(rows, 'Koja')?.textColors).toEqual([palette.foreground]);
  });

  test('a linked value names its source', () => {
    expect(drawnTexts(factRows(facts))).toEqual(factTexts);
  });
});

describe('factPairs', () => {
  test('pairs wrap, with a wider gap between pairs than inside one', () => {
    const pairs = factPairs(facts);
    const [firstPair] = pairs.kids;
    const pairGap = Number(pairs.styles['gap_x']?.[0]);
    const labelGap = Number(firstPair?.styles['gap']?.[0]);

    expect(pairs.styles['flex_wrap']).toBeDefined();
    expect(pairGap).toBeGreaterThan(labelGap);
  });

  test('a pair keeps its label whole and lets the value take the cut', () => {
    const [, linkedPair] = factPairs(facts).kids;
    const label = linkedPair?.kids[0];
    const value = linkedPair?.kids[1];

    expect(label?.styles['flex_none']).toBeDefined();
    expect(value?.styles['flex_shrink']).toEqual([1]);
  });

  test('a pair draws its label and its value together', () => {
    expect(drawnTexts(factPairs(facts))).toEqual(factTexts);
  });
});
