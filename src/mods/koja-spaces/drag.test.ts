import { describe, expect, test } from 'bun:test';

import { dragLine, dropAction, setDragOver, startDrag } from './drag.ts';

describe('dropAction', () => {
  test('moves the dragged space when the live order changes during the drag', () => {
    const drag = setDragOver(startDrag(['a', 'b', 'c'], 0), 'c', true);

    // Something else reorders the spaces while the pointer is held down.
    const action = dropAction(drag, 'c', ['b', 'c', 'a']);

    expect(action).toEqual({ kind: 'move', id: 'a', index: 2 });
  });

  test('selects the dragged space when it is released where it started', () => {
    const drag = startDrag(['a', 'b', 'c'], 1);

    expect(dropAction(drag, 'b', ['a', 'b', 'c'])).toEqual({ kind: 'select', id: 'b' });
  });

  test('does nothing when the dragged space is gone', () => {
    const drag = setDragOver(startDrag(['a', 'b', 'c'], 0), 'b', true);

    expect(dropAction(drag, 'b', ['b', 'c'])).toBeNull();
  });

  test('does nothing when the pointer left a different row before release', () => {
    const drag = setDragOver(startDrag(['a', 'b', 'c'], 0), 'b', true);

    expect(dropAction(drag, 'c', ['a', 'b', 'c'])).toBeNull();
  });
});

describe('dragLine', () => {
  test('draws below a target further down and above one further up', () => {
    const down = setDragOver(startDrag(['a', 'b', 'c'], 0), 'b', true);
    const up = setDragOver(startDrag(['a', 'b', 'c'], 2), 'b', true);

    expect(dragLine(down, 'b', ['a', 'b', 'c'])).toBe('bottom');
    expect(dragLine(up, 'b', ['a', 'b', 'c'])).toBe('top');
  });

  test('draws nothing over its own row', () => {
    const drag = startDrag(['a', 'b', 'c'], 1);

    expect(dragLine(drag, 'b', ['a', 'b', 'c'])).toBeUndefined();
  });
});

describe('setDragOver', () => {
  test('clears the target when the machine does not match', () => {
    const drag = setDragOver(startDrag(['a', 'b'], 0), 'b', false);

    expect(drag.over).toBeNull();
  });
});
