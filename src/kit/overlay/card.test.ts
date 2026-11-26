import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../../tests/moduleFakes.ts';
import { popupFrameRadius, spacing } from '../size.ts';

const palette = {
  border: '#999ca7',
  popover: '#dcdee5',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ v_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake());

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './card.ts';

const { overlayCard } = (await import(modulePath)) as {
  overlayCard: (id: string) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('overlayCard', () => {
  test('draws the popover fill, the border outline, the popup frame radius, and the card padding', () => {
    const card = overlayCard('sample');

    expect(card.backgroundColors).toContain(palette.popover);
    expect(card.borderColors).toContain(palette.border);
    expect(card.styles['rounded']).toEqual([popupFrameRadius]);
    expect(card.styles['p']).toEqual([spacing.small]);
  });
});
