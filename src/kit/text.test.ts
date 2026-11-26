import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

const palette = { dim: '#2b2b3b', foreground: '#3c3c4c' } as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './text.ts';

const { linkText } = (await import(modulePath)) as {
  linkText: (text: string, cut?: 'middle') => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('linkText', () => {
  test('a link draws its text in foreground, underlined, with a pointer cursor', () => {
    const link = linkText('ME-1175');

    expect(drawnTexts(link)).toEqual(['ME-1175']);
    expect(link.textColors.at(-1)).toBe(palette.foreground);
    expect(link.styles['underline']).toBeDefined();
    expect(link.styles['cursor_pointer']).toBeDefined();
  });

  test('a link that cuts in the middle shrinks and clips its text there', () => {
    const link = linkText('ME-1175', 'middle');

    expect(link.styles['truncate']).toBeDefined();
    expect(link.styles['text_ellipsis_middle']).toBeDefined();
    expect(link.styles['flex_shrink']).toEqual([1]);
    expect(link.styles['underline']).toBeDefined();
  });

  test('a link without a cut keeps its width', () => {
    const link = linkText('ME-1175');

    expect(link.styles['text_ellipsis_middle']).toBeUndefined();
    expect(link.styles['flex_none']).toBeDefined();
  });
});
