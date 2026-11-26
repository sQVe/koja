import { describe, expect, test } from 'bun:test';

import { folderNameOf, keepEarliest } from './fields.ts';

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

describe('keepEarliest', () => {
  test('keeps the first time it is given for a key', () => {
    const stored = new Map<string, number>();

    keepEarliest(stored, 'key', 700);
    keepEarliest(stored, 'key', 900);

    expect(stored.get('key')).toBe(700);
  });

  test('moves a later time back to an earlier one', () => {
    const stored = new Map([['key', 900]]);

    keepEarliest(stored, 'key', 700);

    expect(stored.get('key')).toBe(700);
  });

  test('keeps the time it already holds for the same moment', () => {
    const stored = new Map([['key', 700]]);

    keepEarliest(stored, 'key', 700);

    expect(stored.get('key')).toBe(700);
  });
});
