import { describe, expect, test } from 'bun:test';

import type { SpaceStack } from '../../data/spaceStack.ts';
import { stackProgressOf } from './progress.ts';

const stack = (total: number): SpaceStack => ({
  pulls: Array.from({ length: total }, (_unused, index) => ({
    branch: `me-${index + 1}-branch`,
    ticket: null,
    number: null,
    title: null,
    state: 'open',
    checkedOut: index === total - 1,
    restack: 'none',
    need: null,
  })),
  merged: 0,
  total,
});

describe('stackProgressOf', () => {
  test('a stack of one shows no count', () => {
    expect(stackProgressOf(stack(1))).toBeNull();
  });
});
