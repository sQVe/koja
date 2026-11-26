import { describe, expect, test } from 'bun:test';

import { allFilter, filterMark, statusFilters } from './filters.ts';

describe('filterMark', () => {
  test('draws the mark of the one status each filter keeps', () => {
    const marks = statusFilters.map((filter) => filterMark(filter));

    expect(marks).toEqual([null, 'blocked', 'done', 'working', 'idle']);
  });

  test('draws no mark for All, which covers every status', () => {
    expect(filterMark(allFilter)).toBeNull();
  });
});
