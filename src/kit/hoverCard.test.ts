import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementsWithStyle } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface HoverCardOptions {
  header: DrawnElement;
  body: DrawnElement[];
  footer: DrawnElement;
}

const palette = { border: '#1a1a1a', foreground: '#3c3c4c', popover: '#4d4d4d' } as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './hoverCard.ts';

const { hoverCard, hoverCardHeight } = (await import(modulePath)) as {
  hoverCard: (options: HoverCardOptions) => DrawnElement;
  hoverCardHeight: (bodyRows: number) => number;
};

afterAll(() => {
  mock.restore();
});

const textElement = (text: string): DrawnElement => {
  const element = drawn();

  element.texts.push(text);

  return element;
};

const cardWithBodyRows = (bodyRows: number): DrawnElement =>
  hoverCard({
    header: textElement('Tau workflow sidebar'),
    body: Array.from({ length: bodyRows }, (_unused, index) => textElement(`#${index}`)),
    footer: textElement('8 PRs'),
  });

const tipRow = (layer: DrawnElement): number => {
  const [top] = layer.styles['top'] as [number];
  const [height] = layer.styles['h'] as [number];

  return top + (height - 1) / 2;
};

describe('hoverCard', () => {
  test('the card draws its header, body rows, and footer in order', () => {
    expect(drawnTexts(cardWithBodyRows(2))).toEqual(['Tau workflow sidebar', '#0', '#1', '8 PRs']);
  });

  test('the arrow tip sits arrowTop px below the card top', () => {
    for (const bodyRows of [1, 6]) {
      const layers = elementsWithStyle(cardWithBodyRows(bodyRows), 'top');
      const middle = hoverCardHeight(bodyRows) / 2;

      expect(layers.map(tipRow)).toEqual([middle, middle]);
    }
  });

  test('the arrow draws its outline in the border color under a popover fill', () => {
    const layers = elementsWithStyle(cardWithBodyRows(2), 'top');
    const columnColors = layers.map((layer) => layer.kids[0]?.backgroundColors.at(-1));

    expect(columnColors).toEqual([palette.border, palette.popover]);
  });
});
