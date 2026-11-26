import { describe, expect, test } from 'bun:test';

import { stackOf, stackPullOf } from '../../../tests/pickerFixtures.ts';
import type { SpaceStack } from '../../data/spaceStack.ts';
import { scoreCeiling } from './match.ts';
import { stackMatchOf } from './stackSearch.ts';

const mergedStack = (): SpaceStack =>
  stackOf([
    stackPullOf({ branch: 'add-search', number: 501 }),
    stackPullOf({ branch: 'add-search-ui', number: 504, state: 'merged' }),
    stackPullOf({ branch: 'fix-crash', number: 505 }),
  ]);

const ticketStack = (): SpaceStack =>
  stackOf([
    stackPullOf({ branch: 'me-1181-bottom', ticket: 'ME-1181' }),
    stackPullOf({ branch: 'me-1182-middle', ticket: 'ME-1182' }),
  ]);

describe('stackMatchOf', () => {
  test('an exact PR number scores above every field match', () => {
    const match = stackMatchOf('504', mergedStack());

    expect(match?.reason).toEqual({ value: '#504', position: 2, total: 3, state: 'merged' });
    expect(match?.score).toBeGreaterThan(2 * scoreCeiling('504'));
  });

  test('a leading # matches the same PR', () => {
    expect(stackMatchOf('#504', mergedStack())?.reason).toEqual(
      stackMatchOf('504', mergedStack())?.reason,
    );
  });

  test('a partial PR number does not match', () => {
    expect(stackMatchOf('50', mergedStack())).toBeNull();
    expect(stackMatchOf('5041', mergedStack())).toBeNull();
  });

  test('a ticket or branch names the PR it belongs to', () => {
    expect(stackMatchOf('ME-1182', ticketStack())?.reason).toEqual({
      value: 'ME-1182',
      position: 2,
      total: 2,
      state: 'open',
    });

    expect(stackMatchOf('bottom', ticketStack())?.reason).toEqual({
      value: 'me-1181-bottom',
      position: 1,
      total: 2,
      state: 'open',
    });
  });

  test('equal scores keep the lower PR', () => {
    const stack = stackOf([
      stackPullOf({ branch: 'me-1-one', number: 601 }),
      stackPullOf({ branch: 'me-1-two', number: 602 }),
    ]);

    expect(stackMatchOf('me-1', stack)?.reason.value).toBe('me-1-one');
  });

  test('an unknown state gives no state', () => {
    const stack = stackOf([stackPullOf({ branch: 'me-9-nine', ticket: 'ME-9', state: 'unknown' })]);

    expect(stackMatchOf('ME-9', stack)?.reason.state).toBeNull();
  });

  test('no stack and an empty query give no match', () => {
    expect(stackMatchOf('504', null)).toBeNull();
    expect(stackMatchOf('', mergedStack())).toBeNull();
  });
});
