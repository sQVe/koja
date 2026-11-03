import { describe, expect, test } from 'bun:test';

import { diffRows } from './diffRows.ts';

describe('diffRows', () => {
  test('numbers hunk lines from the hunk header', () => {
    const rows = diffRows(['@@ -3,2 +4,3 @@', ' context', '-old', '+new', ' after']);

    expect(rows).toEqual([
      { kind: '@', text: '@@ -3,2 +4,3 @@' },
      { kind: ' ', number: 4, text: 'context' },
      { kind: '-', number: 4, text: 'old' },
      { kind: '+', number: 5, text: 'new' },
      { kind: ' ', number: 6, text: 'after' },
    ]);
  });

  test('keeps the headers before the first hunk unnumbered', () => {
    const rows = diffRows(['diff --git a/a.ts b/a.ts', 'index 000..111', '@@ -1 +1 @@', '+only']);

    expect(rows).toEqual([
      { kind: '', text: 'diff --git a/a.ts b/a.ts' },
      { kind: '', text: 'index 000..111' },
      { kind: '@', text: '@@ -1 +1 @@' },
      { kind: '+', number: 1, text: 'only' },
    ]);
  });
});
