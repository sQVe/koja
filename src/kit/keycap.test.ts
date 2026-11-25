import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, drawnTree } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface OverlayHint {
  normal: string[];
  insert?: string[];
}

const palette = {
  accent: '#4e4e8f',
  border: '#999ca7',
  dim: '#525460',
  popover: '#dcdee5',
  selected: '#c6c9d1',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () =>
  herdrFake({ settings: () => ({ font_family: 'Maple Mono' }), theme: () => palette }),
);

const modulePath = './keycap.ts';

const { keycap, overlayHints } = (await import(modulePath)) as {
  keycap: (key: string) => DrawnElement;
  overlayHints: (hint: OverlayHint, normalMode: boolean) => DrawnElement[];
};

afterAll(() => {
  mock.restore();
});

describe('keycap', () => {
  test('draws a lower-case key as it is', () => {
    expect(drawnTexts(keycap('w'))).toEqual(['w']);
  });

  test('draws a shifted key with the shift mark', () => {
    expect(drawnTexts(keycap('H'))).toEqual(['⇧H']);
  });
});

describe('overlayHints', () => {
  const hint = { normal: ['w', 'v'], insert: ['tab'] };

  test('shows the normal-mode sequence in normal mode', () => {
    expect(drawnTexts(drawnTree(overlayHints(hint, true)))).toEqual(['w', 'v']);
  });

  test('shows the insert binding in insert mode', () => {
    expect(drawnTexts(drawnTree(overlayHints(hint, false)))).toEqual(['tab']);
  });

  test('shows nothing in insert mode when the row has no insert binding', () => {
    expect(overlayHints({ normal: ['w', 'v'] }, false)).toEqual([]);
  });
});
