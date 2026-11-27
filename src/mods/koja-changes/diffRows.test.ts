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

  test('pads a tab to the next stop so the text keeps its columns', () => {
    const rows = diffRows(['@@ -1 +1 @@', '+\tif (a) {', '-ab\tb']);

    expect(rows.map((row) => row.text)).toEqual(['@@ -1 +1 @@', '    if (a) {', 'ab  b']);
  });

  test('pads a tab in a hunk heading and a file heading', () => {
    const rows = diffRows(['file\tname', '@@ -1\t+1 @@']);

    expect(rows.map((row) => row.text)).toEqual(['file    name', '@@ -1   +1 @@']);
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
