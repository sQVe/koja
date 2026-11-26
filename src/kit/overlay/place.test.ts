import { describe, expect, test } from 'bun:test';

import { mainColumnInsets, mainColumnPlacement } from './place.ts';

const tree = (sidebar: Record<string, unknown>, padding: unknown = 6): unknown => ({
  id: 'root',
  type: 'row',
  children: [
    { id: 'sidebar', type: 'column', size: { px: 268 }, ...sidebar },
    {
      id: 'work',
      type: 'column',
      children: [
        { id: 'tabs', type: 'block', size: { px: 28 }, padding: [0, 6] },
        { id: 'work-body', type: 'row', padding },
      ],
    },
  ],
});

describe('mainColumnInsets', () => {
  test('reads the sidebar width and the tab bar plus the work padding', () => {
    expect(mainColumnInsets(tree({}))).toEqual({ left: 268, top: 34 });
  });

  test('drops the sidebar width while it is hidden', () => {
    expect(mainColumnInsets(tree({ hidden: true })).left).toBe(0);
  });

  test('answers zeros for a missing node', () => {
    expect(mainColumnInsets({ id: 'root', children: [] })).toEqual({ left: 0, top: 0 });
  });

  test('answers zeros for a malformed tree', () => {
    expect(mainColumnInsets(null)).toEqual({ left: 0, top: 0 });
    expect(mainColumnInsets('sidebar')).toEqual({ left: 0, top: 0 });
    expect(mainColumnInsets([])).toEqual({ left: 0, top: 0 });
  });

  test('reads a list padding from its first value', () => {
    expect(mainColumnInsets(tree({}, [6, 0])).top).toBe(34);
  });
});

describe('mainColumnPlacement', () => {
  test('moves the card past the popup inset and off the sidebar', () => {
    expect(mainColumnPlacement({ left: 268, top: 34 }, 40)).toEqual({
      left: 260,
      right: 8,
      top: 66,
    });
  });

  test('centers the card from the window edge while the sidebar is hidden', () => {
    expect(mainColumnPlacement({ left: 0, top: 34 }, 40)).toEqual({
      left: 0,
      right: 8,
      top: 66,
    });
  });

  test('keeps the card inside the root when the insets are smaller than the popup inset', () => {
    expect(mainColumnPlacement({ left: 4, top: 2 }, 0)).toEqual({ left: 0, right: 8, top: 0 });
  });
});
