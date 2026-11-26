import { describe, expect, test } from 'bun:test';

import { listOf, numberOf, recordOf, stringListOf, stringOf } from './fields.ts';

describe('field readers', () => {
  test('read a nested string through records', () => {
    const props: unknown = { target: { pane: 'p3' } };

    expect(stringOf(recordOf(recordOf(props)['target'])['pane'])).toBe('p3');
  });

  test('keep only the string entries of a list', () => {
    expect(stringListOf(['a', 2, null, 'b'])).toEqual(['a', 'b']);
  });

  test('answer empty values for missing fields or other types', () => {
    expect(recordOf(null)).toEqual({});
    expect(recordOf(['pane'])).toEqual({});
    expect(stringOf(3)).toBeNull();
    expect(listOf({ length: 1 })).toEqual([]);
    expect(stringListOf('a')).toEqual([]);
    expect(numberOf('3')).toBeNull();
  });
});
