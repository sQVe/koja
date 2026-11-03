import { describe, expect, test } from 'bun:test';

import {
  clampIndex,
  headSize,
  listHeight,
  maxScroll,
  placesOf,
  rowAt,
  rowSize,
  scrollToShow,
  totalHeight,
  visible,
  wheel,
  wheelFrom,
} from './viewport.ts';

describe('placesOf', () => {
  test('gives a grouped row its group title above it', () => {
    const places = placesOf(['A', 'A', 'B'], true);

    expect(places).toEqual([
      { head: true, title: 0, row: headSize },
      { head: false, title: headSize + rowSize, row: headSize + rowSize },
      { head: true, title: headSize + 2 * rowSize, row: headSize + 2 * rowSize + headSize },
    ]);
  });

  test('draws no title while ranking', () => {
    const places = placesOf(['A', 'A'], false);

    expect(places).toEqual([
      { head: false, title: 0, row: 0 },
      { head: false, title: rowSize, row: rowSize },
    ]);
  });
});

describe('maxScroll', () => {
  test('is the height past the list', () => {
    const rows = Array.from({ length: 20 }, (_item, index) => `g${index}`);

    expect(maxScroll(placesOf(rows, false))).toBe(20 * rowSize - listHeight);
  });

  test('is zero when every row fits', () => {
    expect(maxScroll(placesOf(['A'], false))).toBe(0);
  });
});

describe('scrollToShow', () => {
  test('scrolls up so the selected row and its title are visible', () => {
    const places = placesOf(
      Array.from({ length: 20 }, () => 'A'),
      false,
    );

    const least = 15 * rowSize + rowSize - listHeight;

    expect(scrollToShow(places, 15, 0, maxScroll(places))).toBe(least);
  });

  test('scrolls down the least that shows the selected row', () => {
    const places = placesOf(
      Array.from({ length: 20 }, () => 'A'),
      false,
    );

    expect(scrollToShow(places, 0, 400, maxScroll(places))).toBe(0);
  });
});

describe('wheel', () => {
  test('moves by the pixel delta a touchpad reports', () => {
    expect(wheel(placesOf(['A'], false), 0, 100, 500, 1)).toEqual({ scroll: 99, at: 0 });
  });

  test('moves a wheel notch by its pixel delta too', () => {
    expect(wheel(placesOf(['A'], false), 0, 100, 500, rowSize)).toEqual({ scroll: 72, at: 0 });
  });

  test('keeps the selection on screen', () => {
    const places = placesOf(
      Array.from({ length: 20 }, () => 'A'),
      false,
    );

    const moved = wheel(places, 0, 0, maxScroll(places), -(listHeight + rowSize));

    expect(moved.at).toBeGreaterThan(0);
    expect(places[moved.at]?.row ?? 0).toBeGreaterThanOrEqual(moved.scroll);
  });
});

describe('visible', () => {
  test('clips rows outside the strip only while scrolling', () => {
    expect(visible(0, rowSize, 0, true)).toBe(true);
    expect(visible(0, rowSize, rowSize * 2, true)).toBe(false);
    expect(visible(0, rowSize, rowSize * 2, false)).toBe(true);
  });
});

describe('totalHeight', () => {
  test('counts an empty list as no height', () => {
    expect(totalHeight([])).toBe(0);
  });
});

describe('clampIndex', () => {
  test('keeps a stale index inside the list', () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(0, 0)).toBe(0);
  });
});

describe('wheelFrom', () => {
  test('starts from the shown scroll after the query changes', () => {
    const short = placesOf(
      Array.from({ length: 15 }, () => 'A'),
      false,
    );

    expect(wheelFrom(short, 0, 400, maxScroll(short), 1)).toEqual({ scroll: 0, at: 0 });
  });
});

describe('rowAt', () => {
  test('returns the last row when the catalog shrank past the selected index', () => {
    expect(rowAt(['only'], 20)).toBe('only');
  });

  test('answers undefined for an empty list', () => {
    const found = rowAt<string>([], 3);

    expect(found).toBeUndefined();
  });
});
