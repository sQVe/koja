import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../../tests/moduleFakes.ts';
import { radius, rowHeight, spacing } from '../size.ts';

const palette = {
  border: '#999ca7',
  dim: '#525460',
  foreground: '#1e2028',
  muted: '#525460',
  popover: '#dcdee5',
  selected: '#c6c8d1',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './row.ts';

const { overlayRow } = (await import(modulePath)) as {
  overlayRow: (options: { size: 'medium'; state: 'normal'; label: string }) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('overlayRow', () => {
  test('fills the card width with the medium row height, card padding, and pill corners', () => {
    const row = overlayRow({ size: 'medium', state: 'normal', label: 'New tab' });

    expect(row.styles['h']).toEqual([rowHeight.medium]);
    expect(row.styles['px']).toEqual([spacing.medium]);
    expect(row.styles['rounded']).toEqual([radius.pill]);
  });
});
