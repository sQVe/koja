import { describe, expect, test } from 'bun:test';

import { countLines, mergeNumstat, parseStatus } from './status.ts';

describe('parseStatus', () => {
  test('reads the letter, the path, and whether a file is fresh', () => {
    const files = parseStatus(' M a.ts\0?? new.ts\0UU c.ts\0');

    expect(files).toEqual([
      { path: 'a.ts', status: 'M', fresh: false },
      { path: 'new.ts', status: 'A', fresh: true },
      { path: 'c.ts', status: 'U', fresh: false },
    ]);
  });

  test('marks unstaged deletes and added files', () => {
    const files = parseStatus(' D gone.ts\0A  added.ts\0');

    expect(files).toEqual([
      { path: 'gone.ts', status: 'D', fresh: false },
      { path: 'added.ts', status: 'A', fresh: false },
    ]);
  });
});

describe('mergeNumstat', () => {
  test('reads add and del for a status file', () => {
    const files = mergeNumstat(parseStatus(' M a.ts\0?? new.ts\0UU c.ts\0'), ['3\t1\ta.ts\0']);

    expect(files).toEqual([
      { path: 'a.ts', status: 'M', fresh: false, add: 3, del: 1, binary: false },
      { path: 'new.ts', status: 'A', fresh: true, add: 0, del: 0, binary: false },
      { path: 'c.ts', status: 'U', fresh: false, add: 0, del: 0, binary: false },
    ]);
  });

  test('adds the cached and worktree counts of a file without a HEAD', () => {
    const files = mergeNumstat(parseStatus(' M a.ts\0'), ['3\t1\ta.ts\0', '2\t4\ta.ts\0']);

    expect(files).toEqual([
      { path: 'a.ts', status: 'M', fresh: false, add: 5, del: 5, binary: false },
    ]);
  });

  test('marks a file the numstat reports as binary', () => {
    const files = mergeNumstat(parseStatus(' M image.png\0'), ['-\t-\timage.png\0']);

    expect(files).toEqual([
      { path: 'image.png', status: 'M', fresh: false, add: 0, del: 0, binary: true },
    ]);
  });
});

describe('countLines', () => {
  test('counts the lines of a text and an empty text', () => {
    expect(countLines('one\ntwo\nthree\n')).toBe(3);
    expect(countLines('one\ntwo')).toBe(2);
    expect(countLines('')).toBe(0);
  });
});
