import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts, elementsWithStyle } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface StackProgressOptions {
  merged: number;
  total: number;
  label: 'count' | 'merged';
}

const palette = { dim: '#2b2b3b', foreground: '#000000' } as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './stackProgress.ts';

const { stackProgress } = (await import(modulePath)) as {
  stackProgress: (options: StackProgressOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const fills = (progress: DrawnElement): DrawnElement[] =>
  elementsWithStyle(progress, 'bg').filter((part) => part.backgroundColors.at(-1) === palette.dim);

describe('stackProgress', () => {
  test('3 of 8 draws a fill 4.5 px wide and the count', () => {
    const progress = stackProgress({ merged: 3, total: 8, label: 'count' });

    expect(fills(progress).map((fill) => fill.styles['w'])).toEqual([[4.5]]);
    expect(drawnTexts(progress)).toEqual(['3/8']);
  });

  test('the merged label names the merged count', () => {
    const progress = stackProgress({ merged: 3, total: 8, label: 'merged' });

    expect(drawnTexts(progress)).toEqual(['3/8 merged']);
  });

  test('a total of 0 draws the track with no fill', () => {
    const progress = stackProgress({ merged: 0, total: 0, label: 'count' });

    expect(fills(progress)).toEqual([]);
    expect(elementsWithStyle(progress, 'bg')).toHaveLength(1);
    expect(drawnTexts(progress)).toEqual(['0/0']);
  });
});
