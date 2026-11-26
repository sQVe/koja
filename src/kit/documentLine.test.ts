import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementWithText, elementsWithStyle } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { DocumentLineOptions } from './documentLine.ts';
import { documentSize } from './size.ts';

const palette = {
  dim: '#2d2d3d',
  foreground: '#4f4f5f',
  muted: '#6b6b7b',
  working: '#7c7c8c',
} as const;

const monospaceFont = 'Iosevka';

const defaultFont = 'JetBrains Mono';

let settingsValues: Record<string, unknown> = { font_family: monospaceFont };

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () =>
  herdrFake({
    settings: () => settingsValues,
    theme: () => palette,
  }),
);

const modulePath = './documentLine.ts';

const { documentLine } = (await import(modulePath)) as {
  documentLine: (line: DocumentLineOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const barFills = (line: DrawnElement): (string | undefined)[] =>
  elementsWithStyle(line, 'bg').map((element) => element.backgroundColors.at(-1));

const drawnFont = (line: DrawnElement): unknown[] | undefined => line.styles['font_family'];

describe('documentLine', () => {
  test('an edited line fills its gutter bar with the warning ink and says edited once', () => {
    const line = documentLine({ number: 6, text: 'Keep the space visible.', bar: 'edited' });

    expect(barFills(line)).toEqual([palette.working]);
    expect(drawnTexts(line)).toEqual(['6', 'Keep the space visible.', 'edited']);
  });

  test('a commented line draws a neutral bar and no edited word', () => {
    const line = documentLine({ number: 12, text: 'Keep marks visible.', bar: 'commented' });

    expect(barFills(line)).toEqual([palette.muted]);
    expect(drawnTexts(line)).toEqual(['12', 'Keep marks visible.']);
  });

  test('a plain line draws no bar', () => {
    const line = documentLine({ number: 1, text: '# Sidebar design' });

    expect(barFills(line)).toEqual([]);
    expect(drawnTexts(line)).toEqual(['1', '# Sidebar design']);
  });

  test('a marked line brightens its number, and a plain line leaves it dim', () => {
    const marked = documentLine({ number: 6, text: 'Keep it.', bar: 'commented' });
    const plain = documentLine({ number: 7, text: 'Plain.' });

    expect(elementWithText(marked, '6')?.textColors).toEqual([palette.foreground]);
    expect(elementWithText(plain, '7')?.textColors).toEqual([palette.dim]);
  });

  test('the number sits right-aligned in one gutter column', () => {
    const number = elementWithText(documentLine({ number: 20, text: 'Last.' }), '20');

    expect(number?.styles['w']).toEqual([documentSize.numberWidth]);
    expect(number?.styles['text_right']).toBeDefined();
  });

  test('the line draws in the terminal font from settings', () => {
    expect(drawnFont(documentLine({ number: 1, text: '# Sidebar design' }))).toEqual([
      monospaceFont,
    ]);
  });

  test('a missing or non-text font setting draws the default terminal font', () => {
    settingsValues = {};

    expect(drawnFont(documentLine({ number: 1, text: '# Sidebar design' }))).toEqual([defaultFont]);

    settingsValues = { font_family: 42 };

    expect(drawnFont(documentLine({ number: 1, text: '# Sidebar design' }))).toEqual([defaultFont]);

    settingsValues = { font_family: monospaceFont };
  });
});
