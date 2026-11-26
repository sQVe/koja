import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

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

let settingsValues: Record<string, unknown> = {};

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

beforeEach(() => {
  settingsValues = { font: monospaceFont };
});

const sidebarLine = (): DrawnElement => documentLine({ number: 1, text: '# Sidebar design' });

const barFills = (line: DrawnElement): (string | undefined)[] =>
  elementsWithStyle(line, 'bg').map((element) => element.backgroundColors.at(-1));

const firstBar = (line: DrawnElement): DrawnElement | undefined => elementsWithStyle(line, 'bg')[0];

const drawnFont = (line: DrawnElement): unknown[] | undefined => line.styles['font_family'];

describe('documentLine', () => {
  test('an edited line fills its gutter bar with the warning ink and says edited once', () => {
    const line = documentLine({ number: 6, text: 'Keep the space visible.', bar: 'edited' });
    const bar = firstBar(line);

    expect(barFills(line)).toEqual([palette.working]);
    expect(bar?.styles['w']).toEqual([documentSize.markWidth]);
    expect(bar?.styles['h']).toEqual([documentSize.markHeight]);
    expect(drawnTexts(line)).toEqual(['6', 'Keep the space visible.', 'edited']);
  });

  test('a commented line draws a neutral bar and no edited word', () => {
    const line = documentLine({ number: 12, text: 'Keep marks visible.', bar: 'commented' });
    const stripe = firstBar(line);

    expect(barFills(line)).toEqual([palette.muted]);
    expect(stripe?.styles['w']).toEqual([documentSize.stripeWidth]);
    expect(stripe?.styles['h_full']).toBeDefined();
    expect(drawnTexts(line)).toEqual(['12', 'Keep marks visible.']);
  });

  test('a bar stops short of its row', () => {
    const line = documentLine({ number: 6, text: 'Keep it.', bar: 'edited' });
    const bar = firstBar(line);
    const rowHeight = Number(line.styles['h']?.[0]);
    const markHeight = Number(bar?.styles['h']?.[0]);

    expect(markHeight).toBeLessThan(rowHeight);
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
    expect(drawnFont(sidebarLine())).toEqual([monospaceFont]);
  });

  test('a missing or non-text font setting draws the default terminal font', async () => {
    settingsValues = {};
    await Promise.resolve();

    expect(drawnFont(sidebarLine())).toEqual([defaultFont]);

    settingsValues = { font: 42 };
    await Promise.resolve();

    expect(drawnFont(sidebarLine())).toEqual([defaultFont]);
  });

  test('a font the user sets after the default reaches the next line', async () => {
    settingsValues = {};
    await Promise.resolve();

    expect(drawnFont(sidebarLine())).toEqual([defaultFont]);

    settingsValues = { font: monospaceFont };
    await Promise.resolve();

    expect(drawnFont(sidebarLine())).toEqual([monospaceFont]);
  });
});
