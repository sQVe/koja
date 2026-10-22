import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { start, counted, updateOf } from './scrollModeFixtures.ts';

it('notifies subscribers when the mode begins, moves, and ends, until they unsubscribe', () => {
  const { mode } = start();
  const { calls, unsubscribe, notifiedBy } = counted(mode);

  expect(
    notifiedBy(() => {
      mode.handle({ kind: 'enter' });
    }),
  ).toBeGreaterThan(0);

  expect(calls.cursors.at(-1)).toEqual({ pane: paneId(1), row: 102, col: 1 });

  expect(
    notifiedBy(() => {
      mode.handle({ kind: 'move', motion: 'up' });
    }),
  ).toBeGreaterThan(0);

  expect(calls.cursors.at(-1)).toEqual({ pane: paneId(1), row: 101, col: 1 });

  expect(
    notifiedBy(() => {
      mode.handle({ kind: 'leave' });
    }),
  ).toBeGreaterThan(0);

  expect(calls.cursors.at(-1)).toBeUndefined();

  unsubscribe();

  const heard = calls.count;

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'leave' });

  expect(calls.count).toBe(heard);
});

it('changes the input mode only between insert and scroll, and only when the focus changed', () => {
  const unchanged = start();

  unchanged.mode.handle({ kind: 'enter' });
  unchanged.external.inputMode = 'insert';

  const { calls } = counted(unchanged.mode);

  unchanged.show({});

  expect(unchanged.modes).toEqual([]);
  expect(calls.count).toBe(0);

  const lost = start();

  lost.mode.handle({ kind: 'enter' });
  lost.external.inputMode = 'normal';
  lost.show({ focused: 2 });

  expect(lost.modes).toEqual([]);

  lost.show({ focused: 1 });

  expect(lost.modes).toEqual([]);

  const regained = start();

  regained.mode.handle({ kind: 'enter' });
  regained.show({ focused: 2 });
  regained.external.inputMode = 'scroll';
  regained.show({ focused: 1 });

  expect(regained.modes).toEqual(['insert']);
});

it('ignores focus changes, keys, and reach calls when no mode exists', () => {
  const { mode, show, modes, scrolls } = start();

  show({ focused: 2 });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'leave' });

  expect(mode.reach(paneId(1))).toBeUndefined();
  expect(mode.cursor()).toBeUndefined();
  expect(modes).toEqual([]);
  expect(scrolls).toEqual([]);
});

it('runs a subscriber that reads scroll state once per notice when output prunes the waiting row', () => {
  const { mode, arrive, fetchedNow } = start([100, 101, 102]);
  const calls = { count: 0, depth: 0, deepest: 0 };

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  mode.handle({ kind: 'move', motion: 'lineEnd' });
  expect(mode.reach(paneId(1))).toEqual({ from: 95, to: 95 });

  mode.subscribe(() => {
    calls.count += 1;
    calls.depth += 1;
    calls.deepest = Math.max(calls.deepest, calls.depth);
    mode.reach(paneId(1));
    mode.cursor();
    calls.depth -= 1;
  });

  arrive({ ...updateOf([100, 101, 102]), sequence: 2, first: 98 });

  expect(calls.count).toBe(1);

  fetchedNow();

  expect(calls.count).toBe(2);
  expect(calls.deepest).toBe(1);
  expect(mode.reach(paneId(1))).toEqual({ from: 98, to: 102 });
});
