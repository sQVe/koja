import { afterAll, describe, expect, mock, test } from 'bun:test';

import {
  drawn,
  drawnTexts,
  drawnTooltips,
  elementWithText,
  numberStyle,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { controlSize } from './size.ts';

const palette = { dim: '#2b2b3b', foreground: '#3c3c4c' } as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './factLine.ts';

const { factLine } = (await import(modulePath)) as {
  factLine: (value: string, facts: string[]) => ReturnType<typeof drawn>;
};

afterAll(() => {
  mock.restore();
});

const branch = 'me-1181-find-a-space-by-pr-ticket-or-branch-in-the-picker';
const facts = ['PR 1 of 2', 'merged'];

describe('factLine', () => {
  test('a long matched value is capped', () => {
    const line = factLine(branch, facts);
    const value = elementWithText(line, branch);

    expect(numberStyle(value ?? undefined, 'max_w')).toBe(controlSize.factValueMaxWidth);
  });

  test('a long matched value is cut in the middle', () => {
    const line = factLine(branch, facts);
    const value = elementWithText(line, branch);

    expect(value?.styles['text_ellipsis_middle']).toBeDefined();
  });

  test('a long matched value shows the whole value on hover', () => {
    expect(drawnTooltips(factLine(branch, facts))).toEqual([branch]);
  });

  test('the value draws in the foreground ink', () => {
    const line = factLine(branch, facts);

    expect(elementWithText(line, branch)?.textColors).toEqual([palette.foreground]);
  });

  test('the value gives up width before the facts', () => {
    const line = factLine(branch, facts);

    expect(elementWithText(line, branch)?.styles['flex_shrink']).toEqual([1]);
  });

  test('the facts and the separator draw in the dim ink', () => {
    const line = factLine(branch, facts);

    expect(elementWithText(line, 'PR 1 of 2')?.textColors).toEqual([palette.dim]);
    expect(elementWithText(line, '·')?.textColors).toEqual([palette.dim]);
  });

  test('a fact keeps its width', () => {
    const line = factLine(branch, facts);

    expect(elementWithText(line, 'PR 1 of 2')?.styles['flex_none']).toBeDefined();
  });

  test('draws the value and every fact in order', () => {
    expect(drawnTexts(factLine(branch, facts))).toEqual([branch, '·', 'PR 1 of 2', '·', 'merged']);
  });

  test('draws only the value when there are no facts', () => {
    expect(drawnTexts(factLine('add-search', []))).toEqual(['add-search']);
  });
});
