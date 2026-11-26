import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

let layoutTree: unknown = null;

await mock.module('herdr', () => herdrFake({ layout: () => layoutTree }));

const { mainColumnInsets, mainColumnPlacement } = (await import('./place.ts')) as {
  mainColumnInsets: () => { left: number; top: number };
  mainColumnPlacement: (
    insets: { left: number; top: number },
    topOffset: number,
  ) => { left: number; right: number; top: number };
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  layoutTree = null;
});

const tree = (
  sidebar: Record<string, unknown>,
  padding: unknown = 6,
  tabs: Record<string, unknown> = {},
): unknown => ({
  id: 'root',
  type: 'row',
  children: [
    { id: 'sidebar', type: 'column', size: { px: 268 }, ...sidebar },
    {
      id: 'work',
      type: 'column',
      children: [
        { id: 'tabs', type: 'block', size: { px: 28 }, padding: [0, 6], ...tabs },
        { id: 'work-body', type: 'row', padding },
      ],
    },
  ],
});

const windowWidth = 1200;

const sidebarWidth = 268;

// Herdr places the popup's root 8 px inside the window on every side, while the root reports the
// window's own width.
const rootInset = 8;

const cardCenter = (placement: { left: number; right: number }): number =>
  rootInset + placement.left + (windowWidth - placement.left - placement.right) / 2;

describe('mainColumnInsets', () => {
  test('reads the sidebar width and the tab bar plus the work padding', () => {
    layoutTree = tree({});

    expect(mainColumnInsets()).toEqual({ left: 268, top: 34 });
  });

  test('drops the sidebar width while it is hidden', () => {
    layoutTree = tree({ hidden: true });

    expect(mainColumnInsets().left).toBe(0);
  });

  test('answers the work padding while the tab bar is hidden', () => {
    layoutTree = tree({}, 6, { hidden: true });

    expect(mainColumnInsets().top).toBe(6);
  });

  test('answers zeros for a missing node', () => {
    layoutTree = { id: 'root', children: [] };

    expect(mainColumnInsets()).toEqual({ left: 0, top: 0 });
  });

  test('answers zeros for a malformed tree', () => {
    layoutTree = null;
    expect(mainColumnInsets()).toEqual({ left: 0, top: 0 });

    layoutTree = 'sidebar';
    expect(mainColumnInsets()).toEqual({ left: 0, top: 0 });

    layoutTree = [];
    expect(mainColumnInsets()).toEqual({ left: 0, top: 0 });
  });

  test('reads a list padding from its first value', () => {
    layoutTree = tree({}, [6, 0]);

    expect(mainColumnInsets().top).toBe(34);
  });
});

describe('mainColumnPlacement', () => {
  test('centers the card in the main column beside the sidebar', () => {
    const place = mainColumnPlacement({ left: 268, top: 34 }, 40);

    expect(cardCenter(place)).toBe((sidebarWidth + windowWidth) / 2);
    expect(place.top).toBe(66);
  });

  test('centers the card in the window while the sidebar is hidden', () => {
    const place = mainColumnPlacement({ left: 0, top: 34 }, 40);

    expect(cardCenter(place)).toBe(windowWidth / 2);
    expect(place.top).toBe(66);
  });

  test('keeps the card inside the root when the insets are smaller than the popup inset', () => {
    expect(mainColumnPlacement({ left: 4, top: 2 }, 0)).toEqual({ left: 0, right: 12, top: 0 });
  });

  test('places the card as the real function does for the kit fake defaults', () => {
    const fake = kitIndexFake();
    const insetsOf = fake['mainColumnInsets'] as () => { left: number; top: number };

    const placeOf = fake['mainColumnPlacement'] as (
      insets: { left: number; top: number },
      topOffset: number,
    ) => { left: number; right: number; top: number };

    const insets = insetsOf();

    expect(placeOf(insets, 40)).toEqual(mainColumnPlacement(insets, 40));
  });
});
