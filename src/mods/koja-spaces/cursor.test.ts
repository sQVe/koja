import { describe, expect, test } from 'bun:test';

import type { ListAction } from '../../kit/section.ts';
import { cursorRow, halfPageOf, moveCursor } from './cursor.ts';

const shown = ['a', 'b', 'c', 'd', 'e'];

const move = (
  action: ListAction,
  cursor: string | null,
  halfPage = 1,
): { cursor: string | null; select: string | null } =>
  moveCursor({ shown, cursor, active: 'a', action, halfPage });

describe('moveCursor', () => {
  test('down from no cursor moves to the row after the active space and selects nothing', () => {
    const result = moveCursor({
      shown: ['a', 'b', 'c'],
      cursor: null,
      active: 'a',
      action: 'down',
      halfPage: 1,
    });

    expect(result).toEqual({ cursor: 'b', select: null });
  });

  test('down moves one row and stops at the last row', () => {
    expect(move('down', 'c')).toEqual({ cursor: 'd', select: null });
    expect(move('down', 'e')).toEqual({ cursor: 'e', select: null });
  });

  test('up moves one row and stops at the first row', () => {
    expect(move('up', 'c')).toEqual({ cursor: 'b', select: null });
    expect(move('up', 'a')).toEqual({ cursor: 'a', select: null });
  });

  test('first and last go to the ends', () => {
    expect(move('first', 'd')).toEqual({ cursor: 'a', select: null });
    expect(move('last', 'b')).toEqual({ cursor: 'e', select: null });
  });

  test('half a page down moves that many rows and stops at the last row', () => {
    expect(move('halfPageDown', 'a', 2)).toEqual({ cursor: 'c', select: null });
    expect(move('halfPageDown', 'd', 2)).toEqual({ cursor: 'e', select: null });
  });

  test('half a page up moves that many rows and stops at the first row', () => {
    expect(move('halfPageUp', 'e', 2)).toEqual({ cursor: 'c', select: null });
    expect(move('halfPageUp', 'b', 2)).toEqual({ cursor: 'a', select: null });
  });

  test('open returns the space of the cursor and keeps the cursor', () => {
    expect(move('open', 'c')).toEqual({ cursor: 'c', select: 'c' });
  });

  test('open with no cursor selects the active space', () => {
    expect(move('open', null)).toEqual({ cursor: 'a', select: 'a' });
  });

  test('a cursor that is no longer shown starts from the active space', () => {
    const result = moveCursor({
      shown: ['a', 'b', 'c'],
      cursor: 'gone',
      active: 'b',
      action: 'down',
      halfPage: 1,
    });

    expect(result).toEqual({ cursor: 'c', select: null });
  });

  test('with no shown active space the cursor starts from the first row', () => {
    const result = moveCursor({
      shown: ['a', 'b', 'c'],
      cursor: null,
      active: 'hidden',
      action: 'down',
      halfPage: 1,
    });

    expect(result).toEqual({ cursor: 'b', select: null });
  });

  test('with no shown row every action returns no cursor and no space', () => {
    const actions: ListAction[] = [
      'down',
      'up',
      'first',
      'last',
      'halfPageDown',
      'halfPageUp',
      'open',
    ];

    const results = actions.map((action) =>
      moveCursor({ shown: [], cursor: 'a', active: 'a', action, halfPage: 1 }),
    );

    expect(results).toEqual(actions.map(() => ({ cursor: null, select: null })));
  });
});

describe('cursorRow', () => {
  test('is the cursor while it is shown', () => {
    expect(cursorRow(['a', 'b'], 'b', 'a')).toBe('b');
  });

  test('is the active space when there is no cursor or it is no longer shown', () => {
    expect(cursorRow(['a', 'b'], null, 'b')).toBe('b');
    expect(cursorRow(['a', 'b'], 'gone', 'b')).toBe('b');
  });

  test('is the first row when the active space is not shown', () => {
    expect(cursorRow(['a', 'b'], null, null)).toBe('a');
  });

  test('is nothing when no row is shown', () => {
    expect(cursorRow([], 'a', 'a')).toBeNull();
  });
});

describe('halfPageOf', () => {
  test('is half the rows that fit in the height', () => {
    expect(halfPageOf(240, 24)).toBe(5);
    expect(halfPageOf(250, 24)).toBe(5);
  });

  test('is at least one row', () => {
    expect(halfPageOf(0, 24)).toBe(1);
    expect(halfPageOf(30, 24)).toBe(1);
  });
});
