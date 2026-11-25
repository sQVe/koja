import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithText,
  elementsWithStyle,
} from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../../tests/moduleFakes.ts';

const palette = {
  border: '#999ca7',
  dim: '#525460',
  foreground: '#1e2028',
  popover: '#dcdee5',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ settings: () => ({}), theme: () => palette }));

const modulePath = './lines.ts';

const { footerLine, searchLine } = (await import(modulePath)) as {
  footerLine: (parts: (string | string[])[]) => DrawnElement;
  searchLine: (text: string) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('searchLine', () => {
  test('draws the search icon, the caret, and the dim placeholder', () => {
    const line = searchLine('Type a command');
    const caret = elementsWithStyle(line, 'bg')[0];

    expect(drawnIcons(line)).toEqual(['search.svg']);
    expect(drawnTexts(line)).toEqual(['Type a command']);
    expect(elementWithText(line, 'Type a command')?.textColors).toContain(palette.dim);
    expect(caret?.styles['bg']).toEqual([palette.foreground]);
    expect(caret?.styles['w']).toEqual([1]);
  });
});

describe('footerLine', () => {
  test('draws dim text and keycaps under a border rule, clipped to the card', () => {
    const line = footerLine([['tab'], 'Next filter', ['↵'], 'Go to']);

    expect(drawnTexts(line)).toEqual(['tab', 'Next filter', '↵', 'Go to']);
    expect(elementWithText(line, 'Next filter')?.textColors).toContain(palette.dim);
    expect(line.borderColors).toContain(palette.border);
    expect(line.styles['overflow_hidden']).toEqual([]);
  });
});
