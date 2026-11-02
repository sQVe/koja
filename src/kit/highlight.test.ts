import { describe, expect, test } from 'bun:test';

import { highlightRuns } from './highlight.ts';

describe('highlightRuns', () => {
  test('joins neighboring letters with the same mark into one run', () => {
    expect(highlightRuns('New tab', [0, 1, 4])).toEqual([
      { text: 'Ne', highlighted: true },
      { text: 'w ', highlighted: false },
      { text: 't', highlighted: true },
      { text: 'ab', highlighted: false },
    ]);
  });

  test('gives one plain run without matches', () => {
    expect(highlightRuns('Zoom', [])).toEqual([{ text: 'Zoom', highlighted: false }]);
  });

  test('counts positions as string indexes', () => {
    expect(highlightRuns('…go', [1])).toEqual([
      { text: '…', highlighted: false },
      { text: 'g', highlighted: true },
      { text: 'o', highlighted: false },
    ]);
  });
});
