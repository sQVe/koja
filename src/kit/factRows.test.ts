import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementWithText } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface Fact {
  label: string;
  value: string;
  source?: 'GitHub' | 'Linear' | 'tikk';
  repository?: string;
}

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
  { label: 'Parent', value: 'ME-1087', source: 'Linear' },
];

describe('factRows', () => {
  test('rail labels take one column and the values keep the text ink', () => {
    const rows = factRows(facts);

    expect(elementWithText(rows, 'Project')?.styles['w']).toEqual([64]);
    expect(elementWithText(rows, 'Parent')?.styles['w']).toEqual([64]);
    expect(elementWithText(rows, 'Project')?.textColors).toEqual([palette.dim]);
    expect(elementWithText(rows, 'Koja')?.textColors).toEqual([palette.foreground]);
  });

  test('a linked value names its source', () => {
    expect(drawnTexts(factRows(facts))).toEqual(['Project', 'Koja', 'Parent', 'ME-1087 · Linear']);
  });
});

describe('factPairs', () => {
  test('pairs wrap, with a wider gap between pairs than inside one', () => {
    const pairs = factPairs(facts);
    const firstPair = pairs.kids[0];

    expect(pairs.styles['flex_wrap']).toBeDefined();
    expect(pairs.styles['gap_x']).toEqual([24]);
    expect(firstPair?.styles['gap']).toEqual([6]);
    expect(24).toBeGreaterThan(6);
  });

  test('a pair draws its label and its value together', () => {
    expect(drawnTexts(factPairs(facts))).toEqual(['Project', 'Koja', 'Parent', 'ME-1087 · Linear']);
  });
});
