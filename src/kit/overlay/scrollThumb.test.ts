import { afterAll, describe, expect, mock, test } from 'bun:test';

import { drawn } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { gpuiKitFake, herdrFake } from '../../../tests/moduleFakes.ts';
import { spacing } from '../size.ts';

interface ThumbPlace {
  top: number;
  height: number;
}

interface ThumbOptions {
  scroll: number;
  total: number;
  view: number;
}

const palette = {
  dim: '#525460',
} as const;

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './scrollThumb.ts';

const { scrollThumb, thumbPlace } = (await import(modulePath)) as {
  scrollThumb: (place: ThumbPlace) => DrawnElement;
  thumbPlace: (options: ThumbOptions) => ThumbPlace | null;
};

afterAll(() => {
  mock.restore();
});

const view = 312;

describe('thumbPlace', () => {
  test('answers null when nothing scrolls', () => {
    expect(thumbPlace({ scroll: 0, total: view, view })).toBeNull();
    expect(thumbPlace({ scroll: 0, total: view - 26, view })).toBeNull();
  });

  test('starts at the top at scroll zero', () => {
    expect(thumbPlace({ scroll: 0, total: view * 2, view })?.top).toBe(0);
  });

  test('ends at the bottom of the view at the largest scroll', () => {
    const total = view * 2;
    const place = thumbPlace({ scroll: total - view, total, view });

    expect(place).not.toBeNull();
    expect((place?.top ?? 0) + (place?.height ?? 0)).toBeCloseTo(view);
  });

  test('never draws shorter than the minimum', () => {
    const place = thumbPlace({ scroll: 0, total: view * 1000, view });

    expect(place?.height).toBe(spacing.xxlarge);
  });

  test('never draws taller than a view shorter than the minimum', () => {
    const shortView = 12;
    const place = thumbPlace({ scroll: 0, total: 40, view: shortView });

    expect(place?.height).toBe(shortView);
    expect(place?.top).toBe(0);
  });
});

describe('scrollThumb', () => {
  test('rounds the thumb by half its width', () => {
    const thumb = scrollThumb({ top: 0, height: spacing.xxlarge });

    expect(thumb.styles['rounded']).toEqual([spacing.xxsmall / 2]);
  });
});
