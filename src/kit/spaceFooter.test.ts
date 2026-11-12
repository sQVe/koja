import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementWithText } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface SpaceFooterOptions {
  title: string;
  progress?: { merged: number; total: number };
  links: DrawnElement[];
  end: DrawnElement;
}

const palette = { border: '#1a1a1a', dim: '#2b2b3b', foreground: '#3c3c4c' } as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const modulePath = './spaceFooter.ts';

const { spaceFooter } = (await import(modulePath)) as {
  spaceFooter: (options: SpaceFooterOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const textElement = (text: string): DrawnElement => {
  const element = drawn();

  element.texts.push(text);

  return element;
};

const footerOf = (progress?: SpaceFooterOptions['progress']): DrawnElement =>
  spaceFooter({
    title: 'Tau workflow sidebar',
    ...(progress === undefined ? {} : { progress }),
    links: [textElement('ME-1175'), textElement('#504')],
    end: textElement('Stack ›'),
  });

describe('spaceFooter', () => {
  test('a space with a stack draws its title, merged progress, links, and end link', () => {
    const footer = footerOf({ merged: 3, total: 8 });

    expect(drawnTexts(footer)).toEqual([
      'Tau workflow sidebar',
      '3/8 merged',
      'ME-1175',
      '·',
      '#504',
      'Stack ›',
    ]);
  });

  test('the title carries its full text as a tooltip', () => {
    const title = elementWithText(footerOf(), 'Tau workflow sidebar');

    expect(title?.tooltipText).toBe('Tau workflow sidebar');
  });

  test('a space with no stack draws no progress', () => {
    expect(drawnTexts(footerOf())).toEqual([
      'Tau workflow sidebar',
      'ME-1175',
      '·',
      '#504',
      'Stack ›',
    ]);
  });
});
