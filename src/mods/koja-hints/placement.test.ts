import { describe, expect, test } from 'bun:test';

import { cardPlacement } from './placement.ts';

interface FakeNode {
  id: string;
  hidden?: boolean;
  size?: { px: number };
  padding?: number | number[];
  gap?: number;
  children?: FakeNode[];
}

const layoutWith = (sidebarHidden: boolean, panelHidden: boolean): FakeNode => ({
  id: 'root',
  children: [
    { id: 'sidebar', hidden: sidebarHidden, size: { px: 268 } },
    {
      id: 'work',
      children: [
        { id: 'tabs', size: { px: 28 } },
        {
          id: 'work-body',
          padding: 6,
          gap: 6,
          children: [{ id: 'main' }, { id: 'panel', hidden: panelHidden, size: { px: 368 } }],
        },
      ],
    },
  ],
});

describe('cardPlacement', () => {
  test('the card centers on the main column, above the pane bottoms', () => {
    expect(cardPlacement(layoutWith(false, true))).toEqual({ left: 274, right: 6, bottom: 30 });
  });

  test('a hidden sidebar leaves the card the whole window width', () => {
    expect(cardPlacement(layoutWith(true, true)).left).toBe(6);
  });

  test('a shown panel narrows the main column by its width and the work area gap', () => {
    expect(cardPlacement(layoutWith(false, false)).right).toBe(380);
  });

  test('a layout without a work area places the card at the window edges', () => {
    expect(cardPlacement({ id: 'root' })).toEqual({ left: 0, right: 0, bottom: 24 });
  });
});
