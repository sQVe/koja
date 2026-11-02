import { describe, expect, test } from 'bun:test';

import { newSpaceArguments } from './newSpace.ts';

describe('newSpaceArguments', () => {
  test('passes an explicit empty machine when the space is on this computer', () => {
    expect(newSpaceArguments(null)).toEqual({ machine: '' });
  });

  test('passes the machine name when the space is on another machine', () => {
    expect(newSpaceArguments('remote')).toEqual({ machine: 'remote' });
  });
});
