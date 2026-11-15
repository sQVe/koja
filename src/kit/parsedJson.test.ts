import { describe, expect, test } from 'bun:test';

import { parsedJson } from './parsedJson.ts';

describe('parsedJson', () => {
  test.each(['', '{{{not json', '{"unfinished":'])('returns null for invalid JSON %j', (text) => {
    expect(parsedJson(text)).toBeNull();
  });

  test.each([
    ['null', null],
    ['false', false],
    ['42', 42],
    ['"saved"', 'saved'],
    ['["a",2]', ['a', 2]],
    ['{"panel":"files"}', { panel: 'files' }],
  ])('reads valid JSON %j without changing its shape', (text, value) => {
    expect(parsedJson(text)).toEqual(value);
  });
});
