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
  linkText: (text: string) => DrawnElement;
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
});
