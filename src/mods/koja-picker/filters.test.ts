import { describe, expect, test } from 'bun:test';

import { filterMark, statusFilters } from './filters.ts';

describe('filterMark', () => {
  test('draws the mark of the one status each filter keeps, and none for All', () => {
    const marks = statusFilters.map((filter) => filterMark(filter));

    expect(marks).toEqual([null, 'blocked', 'done', 'working', 'idle']);
  });
});
