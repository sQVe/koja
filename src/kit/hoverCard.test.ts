import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementsWithStyle } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface HoverCardOptions {
  arrowTop: number;
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

const { hoverCard } = (await import(modulePath)) as {
  hoverCard: (options: HoverCardOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const textElement = (text: string): DrawnElement => {
  const element = drawn();

  element.texts.push(text);

  return element;
};

const cardWithArrowAt = (arrowTop: number): DrawnElement =>
  hoverCard({
    arrowTop,
    header: textElement('Tau workflow sidebar'),
    body: [textElement('#502 Data layer'), textElement('#504 Two-line rows')],
    footer: textElement('Open stack ›'),
  });

const tipRow = (layer: DrawnElement): number => {
  const [top] = layer.styles['top'] as [number];
  const [height] = layer.styles['h'] as [number];

  return top + (height - 1) / 2;
};

describe('hoverCard', () => {
  test('the card draws its header, body rows, and footer in order', () => {
    expect(drawnTexts(cardWithArrowAt(19))).toEqual([
      'Tau workflow sidebar',
      '#502 Data layer',
      '#504 Two-line rows',
      'Open stack ›',
    ]);
  });

  test('the arrow tip sits arrowTop px below the card top', () => {
    const layers = elementsWithStyle(cardWithArrowAt(19), 'top');

    expect(layers.map(tipRow)).toEqual([19, 19]);
  });

  test('the arrow draws its outline in the border color under a popover fill', () => {
    const layers = elementsWithStyle(cardWithArrowAt(19), 'top');
    const columnColors = layers.map((layer) => layer.kids[0]?.backgroundColors.at(-1));

    expect(columnColors).toEqual([palette.border, palette.popover]);
  });
});
