import { describe, expect, test } from 'bun:test';

import { listOf, numberOf, recordOf, stringOf } from './fields.ts';

describe('field readers', () => {
  test('read a nested string through records', () => {
    const props: unknown = { target: { pane: 'p3' } };

    expect(stringOf(recordOf(recordOf(props)['target'])['pane'])).toBe('p3');
  });

  test('answer empty values for missing fields or other types', () => {
    expect(recordOf(null)).toEqual({});
    expect(recordOf(['pane'])).toEqual({});
    expect(stringOf(3)).toBeNull();
    expect(listOf({ length: 1 })).toEqual([]);
    expect(numberOf('3')).toBeNull();
  });
});
