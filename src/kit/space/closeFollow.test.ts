import { describe, expect, test } from 'bun:test';

import type { SpaceOrder } from '../spaceOrder.ts';
import type { CloseLook, CloseWatch, PendingPick } from './closeFollow.ts';
import { closeFollowStep } from './closeFollow.ts';
import type { SpaceSelection } from './spaceSelection.ts';

const order = (shown: string[]): SpaceOrder => ({ shown, hidden: [], roots: [...shown] });

const selection = (count: number, id: string | null): SpaceSelection => ({
  version: 1,
  count,
  id,
});

const pending = (id: string, seenAt: number): PendingPick => ({ id, seenAt });

const watchOf = (changes: Partial<CloseWatch>): CloseWatch => ({
  focused: 'b',
  order: order(['a', 'b', 'c', 'd']),
  selection: selection(1, 'c'),
  pending: null,
  ...changes,
});

const lookOf = (changes: Partial<CloseLook>): CloseLook => ({
  focused: 'b',
  order: order(['a', 'b', 'c', 'd']),
  selection: selection(1, 'c'),
  liveIds: ['a', 'b', 'c', 'd'],
  now: 100,
  ...changes,
});

describe('closeFollowStep', () => {
  test('a pending pick clears when focus lands on it', () => {
    const step = closeFollowStep(
      watchOf({ pending: pending('c', 0) }),
      lookOf({ focused: 'c', now: 100 }),
    );

    expect(step.watch.pending).toBeNull();
  });

  test('a pending pick clears when its space closes', () => {
    const step = closeFollowStep(
      watchOf({ pending: pending('c', 0) }),
      lookOf({ liveIds: ['a', 'b', 'd'], now: 100 }),
    );

    expect(step.watch.pending).toBeNull();
  });

  test('a newer pick replaces the pending one', () => {
    const step = closeFollowStep(
      watchOf({ pending: pending('c', 0) }),
      lookOf({ selection: selection(2, 'd'), now: 100 }),
    );

    expect(step.watch.pending).toEqual(pending('d', 100));
  });

  test('a close seen while a pick is pending is dropped rather than followed later', () => {
    const blocked = closeFollowStep(
      watchOf({ focused: 'b', pending: pending('c', 0) }),
      lookOf({ focused: 'c', liveIds: ['a', 'c'], now: 100 }),
    );

    const later = closeFollowStep(
      blocked.watch,
      lookOf({ focused: 'c', liveIds: ['a', 'c'], now: 200 }),
    );

    expect(blocked.command).toBeNull();
    expect(later.command).toBeNull();
  });
});
