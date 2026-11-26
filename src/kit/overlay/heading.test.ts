import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../../tests/moduleFakes.ts';
import { rowHeight, spacing } from '../size.ts';

const palette = {
  border: '#999ca7',
  dim: '#525460',
  muted: '#525460',
  popover: '#dcdee5',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ settings: () => ({}), theme: () => palette }));

const modulePath = './heading.ts';

const { overlayHeading } = (await import(modulePath)) as {
  overlayHeading: (label: string, letter: string | null) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('overlayHeading', () => {
  test('draws the section heading, then its part letter right after it', () => {
    const heading = overlayHeading('Tabs', 't');

    expect(drawnTexts(heading)).toEqual(['Tabs', 't']);
    expect(heading.styles['h']).toEqual([rowHeight.small]);
    expect(heading.styles['px']).toEqual([spacing.medium]);
  });

  test('draws no keycap for a group without a part letter', () => {
    expect(drawnTexts(overlayHeading('Terminals', null))).toEqual(['Terminals']);
  });
});
