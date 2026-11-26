import { afterAll, describe, expect, mock, test } from 'bun:test';

import { drawn, drawnTooltips, elementWithText, numberStyle } from '../../tests/drawn.ts';
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
  test('a long matched value is capped and cut in the middle', () => {
    const line = factLine(branch, facts);
    const value = elementWithText(line, branch);
    const fact = elementWithText(line, facts[0] ?? '');

    expect(numberStyle(value ?? undefined, 'max_w')).toBe(controlSize.factValueMaxWidth);
    expect(value?.styles['text_ellipsis_middle']).toBeDefined();
    expect(drawnTooltips(line)).toEqual([branch]);
    expect(fact?.styles['flex_none']).toBeDefined();
  });
});
