import { describe, expect, test } from 'bun:test';

import { emptyLine } from './emptyLine.ts';

describe('emptyLine', () => {
  test('a failed read asks for the error state', () => {
    expect(emptyLine('Could not read git status.', false, null).kind).toBe('error');
  });

  test('an error wins over a pending read', () => {
    expect(emptyLine('Could not read git status.', true, '/work/koja').kind).toBe('error');
  });

  test('a pending read asks for the loading state', () => {
    expect(emptyLine(null, true, null).kind).toBe('loading');
  });

  test('no data asks for the empty state', () => {
    expect(emptyLine(null, false, null).kind).toBe('empty');
  });
});
