import { describe, expect, test } from 'bun:test';

import { startDrag } from '../../kit/drag.ts';
import { tabDropAction } from './tabDrop.ts';

describe('tabDropAction', () => {
  test('moves the dragged tab after the live order changes during the drag', () => {
    // Tab a is pressed at index 0. The live order becomes b, c, a. Release lands on c.
    const drag = startDrag(['a', 'b', 'c'], 0);

    expect(tabDropAction(drag, 'c', ['b', 'c', 'a'])).toEqual({ kind: 'move', id: 'a', index: 2 });
  });

  test('selects the released tab when it is released where it was pressed', () => {
    const drag = startDrag(['a', 'b', 'c'], 1);

    expect(tabDropAction(drag, 'b', ['a', 'b', 'c'])).toEqual({ kind: 'select', id: 'b' });
  });

  test('selects the released tab when no tab was pressed', () => {
    expect(tabDropAction(startDrag([], 0), 'b', ['a', 'b'])).toEqual({ kind: 'select', id: 'b' });
  });
});
