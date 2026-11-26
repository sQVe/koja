import { describe, expect, test } from 'bun:test';

import { mergedStack, stackOf, stackPullOf, ticketStack } from '../../../tests/pickerFixtures.ts';
import { stackMatchOf } from './stackSearch.ts';

describe('stackMatchOf', () => {
  test('an exact PR number outranks every field match', () => {
    const stack = stackOf([
      stackPullOf({ branch: '504', number: 501 }),
      stackPullOf({ branch: 'add-search-ui', number: 504, state: 'merged' }),
    ]);

    const match = stackMatchOf('504', stack);

    expect(match?.tier).toBe('exact');
    expect(match?.reason).toEqual({ value: '#504', position: 2, total: 2, state: 'merged' });
  });

  test('a leading # matches the same PR', () => {
    expect(stackMatchOf('#504', mergedStack())?.reason).toEqual(
      stackMatchOf('504', mergedStack())?.reason,
    );
  });

  test('a query that equals no stack PR and no field gives no match', () => {
    expect(stackMatchOf('5041', mergedStack())).toBeNull();
    expect(stackMatchOf('504x', mergedStack())).toBeNull();
    expect(stackMatchOf('50', mergedStack())).toBeNull();
  });

  test('a digits query matches the stack PR whose number equals it', () => {
    const stack = stackOf([
      stackPullOf({ branch: 'add-search', number: 504 }),
      stackPullOf({ branch: 'fix-crash', number: 1504 }),
    ]);

    expect(stackMatchOf('#504', stack)?.reason).toEqual({
      value: '#504',
      position: 1,
      total: 2,
      state: 'open',
    });
  });

  test('a digits query that equals no stack PR still matches a branch holding it', () => {
    const stack = stackOf([stackPullOf({ branch: 'fix-5040', number: 501 })]);

    expect(stackMatchOf('504', stack)?.reason).toEqual({
      value: 'fix-5040',
      position: 1,
      total: 1,
      state: 'open',
    });
  });

  test('a digits query that equals no stack PR still matches a ticket holding it', () => {
    const stack = stackOf([
      stackPullOf({ branch: 'me-1181-bottom', ticket: 'ME-1504', number: 502 }),
    ]);

    expect(stackMatchOf('504', stack)?.reason).toEqual({
      value: 'ME-1504',
      position: 1,
      total: 1,
      state: 'open',
    });
  });

  test('a ticket or branch names the PR it belongs to', () => {
    expect(stackMatchOf('ME-1182', ticketStack())?.reason).toEqual({
      value: 'ME-1182',
      position: 2,
      total: 3,
      state: 'open',
    });

    expect(stackMatchOf('bottom', ticketStack())?.reason).toEqual({
      value: 'me-1181-bottom',
      position: 1,
      total: 3,
      state: 'open',
    });
  });

  test('a ticket wins a tie with a branch inside one PR', () => {
    const stack = stackOf([stackPullOf({ branch: 'me-1', ticket: 'ME-1' })]);

    expect(stackMatchOf('me-1', stack)?.reason.value).toBe('ME-1');
  });

  test('equal scores keep the lower PR', () => {
    const stack = stackOf([
      stackPullOf({ branch: 'me-1-one', number: 601 }),
      stackPullOf({ branch: 'me-1-two', number: 602 }),
    ]);

    expect(stackMatchOf('me-1', stack)?.reason.value).toBe('me-1-one');
  });

  test('a stronger field match later outranks a weaker one', () => {
    const stack = stackOf([
      stackPullOf({ branch: 'some-me-1', number: 601 }),
      stackPullOf({ branch: 'me-1-two', number: 602 }),
    ]);

    expect(stackMatchOf('me-1', stack)?.reason).toEqual({
      value: 'me-1-two',
      position: 2,
      total: 2,
      state: 'open',
    });
  });

  test('an exact PR before a later field hit keeps the exact PR', () => {
    const stack = stackOf([
      stackPullOf({ branch: 'add-search', number: 504, state: 'merged' }),
      stackPullOf({ branch: 'x504y', number: 900 }),
    ]);

    expect(stackMatchOf('504', stack)?.reason).toEqual({
      value: '#504',
      position: 1,
      total: 2,
      state: 'merged',
    });
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
