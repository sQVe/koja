import { describe, expect, test } from 'bun:test';

import { hoveredAfter } from './hoverTarget.ts';

describe('hoveredAfter', () => {
  test('marks the item the pointer enters', () => {
    expect(hoveredAfter('a', 'b', true)).toBe('b');
  });

  test('clears the item the pointer leaves', () => {
    expect(hoveredAfter('a', 'a', false)).toBeNull();
  });

  test('keeps the hovered item when the pointer leaves another one', () => {
    expect(hoveredAfter('b', 'a', false)).toBe('b');
  });
});
