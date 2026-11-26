import { describe, expect, test } from 'bun:test';

import { folderNameOf } from './fields.ts';

describe('folderNameOf', () => {
  test('names the last folder with or without a trailing slash', () => {
    expect(folderNameOf('/code/koja')).toBe('koja');
    expect(folderNameOf('/code/koja/')).toBe('koja');
  });

  test('returns an empty name when no folder is present', () => {
    expect(folderNameOf(null)).toBe('');
    expect(folderNameOf('')).toBe('');
    expect(folderNameOf('/')).toBe('');
  });
});
