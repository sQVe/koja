import { expect, it } from 'bun:test';

import { createRowCache } from '../client/client.ts';
import type { InputMode } from '../client/client.ts';
import { paneId } from '../ids.ts';
import { CursorShape } from '../rows/rows.ts';
import { createScrollMode } from './scrollMode.ts';
import { activeTop, updateOf, snapshotWith, start, counted } from './scrollModeFixtures.ts';

it('enters at the pane cursor without moving the view', () => {
  const { mode, scrolls } = start();

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 102, col: 1 });
  expect(scrolls).toEqual([]);
});

it('scrolls the view up only when the cursor leaves it, and keeps scrolling from its own top', () => {
  const { mode, scrolls } = start();

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });

  expect(scrolls).toEqual([]);

  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });

  expect(mode.cursor()).toMatchObject({ row: 98 });
  expect(scrolls).toEqual([99, 98]);
});

it('sends G to the bottom after the CLI scrolled a following view to the top', () => {
  const { mode, scrolls, show } = start();

  mode.handle({ kind: 'enter' });
  show({ topRow: 0 });
  mode.handle({ kind: 'move', motion: 'historyBottom' });

  expect(mode.cursor()).toMatchObject({ row: 102 });
  expect(scrolls).toEqual(['bottom']);
});

it('returns the view to the bottom on G, even when it was scrolled at entry', () => {
  const { mode, scrolls } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyBottom' });

  expect(mode.cursor()).toMatchObject({ row: 102 });
  expect(scrolls).toEqual(['bottom']);
});

it('restores the view from entry on leaving, whichever key leaves', () => {
  const followed = start();

  followed.mode.handle({ kind: 'enter' });
  followed.mode.handle({ kind: 'move', motion: 'historyTop' });
  followed.mode.handle({ kind: 'leave' });

  expect(followed.scrolls).toEqual([95, 'bottom']);
  expect(followed.mode.cursor()).toBeUndefined();

  const pinned = start(undefined, 97);

  pinned.mode.handle({ kind: 'enter' });
  pinned.mode.handle({ kind: 'move', motion: 'historyTop' });
  pinned.mode.handle({ kind: 'leave' });

  expect(pinned.scrolls).toEqual([95, 97]);

  const unmoved = start(undefined, 97);

  unmoved.mode.handle({ kind: 'enter' });
  unmoved.mode.handle({ kind: 'leave' });

  expect(unmoved.scrolls).toEqual([]);
});

it('restores the entry view after G took the view to the bottom', () => {
  const { mode, scrolls } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyBottom' });
  mode.handle({ kind: 'leave' });

  expect(scrolls).toEqual(['bottom', 97]);
});

it('enters at the bottom-left of a view the CLI already scrolled', () => {
  const { mode } = start(undefined, 97);

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 99, col: 0 });
});

it("keeps another pane's mode when a suspended pane is removed", () => {
  const { mode, show, external } = start();

  mode.handle({ kind: 'enter' });
  show({ focused: 2 });
  external.inputMode = 'normal';
  show({ removePane: 1 });

  expect(external.inputMode).toBe('normal');
  expect(mode.cursor()).toBeUndefined();
});

it('falls back to normal mode when there is no pane to scroll', () => {
  const cache = createRowCache({ rowLimit: 10 });
  const modes: InputMode[] = [];

  const mode = createScrollMode({
    getState: () => ({ snapshot: snapshotWith(undefined), inputMode: 'scroll' }),
    rowCache: () => cache,
    scrollPane: () => Promise.resolve(),
    setInputMode: (next) => {
      modes.push(next);
    },
    subscribe: () => () => undefined,
    subscribeRows: () => () => undefined,
    subscribeFetched: () => () => undefined,
  });

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toBeUndefined();
  expect(modes).toEqual(['normal']);
});

it('resumes a mode that entering finds on the same pane, with its cursor', () => {
  const { mode, show, modes, external } = start();
  const { notifiedBy } = counted(mode);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'up' });
  mode.handle({ kind: 'move', motion: 'right' });

  const before = mode.cursor();

  expect(
    notifiedBy(() => {
      mode.handle({ kind: 'enter' });
    }),
  ).toBeGreaterThan(0);

  expect(mode.cursor()).toEqual(before);

  show({ focused: 2 });
  external.focused = 1;
  external.inputMode = 'scroll';
  mode.handle({ kind: 'enter' });
  show({ focused: 2 });

  expect(modes).toEqual(['insert', 'insert']);
});

it("restores the old pane's view when entering on another pane", () => {
  const { mode, scrolls, scrolled, external } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyTop' });
  external.focused = 2;
  mode.handle({ kind: 'enter' });

  expect(scrolled).toEqual([paneId(1), paneId(1)]);
  expect(scrolls).toEqual([95, 97]);
  expect(mode.cursor()).toMatchObject({ pane: paneId(2) });
});

it('enters at the bottom-left cell when the pane cursor is hidden', () => {
  const { mode, arrive } = start();

  arrive({
    ...updateOf([95, 96, 97, 98, 99, 100, 101, 102]),
    cursor: { x: 1, y: 2, visible: false, shape: CursorShape.default, blinking: false },
  });

  mode.handle({ kind: 'enter' });

  expect(mode.cursor()).toEqual({ pane: paneId(1), row: 102, col: 0 });
});

it('builds keys typed before the server answers on the requested top', () => {
  const { mode, scrolls } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  mode.handle({ kind: 'move', motion: 'historyBottom' });
  mode.handle({ kind: 'move', motion: 'up' });

  expect(scrolls).toEqual(['bottom']);
  expect(mode.cursor()).toMatchObject({ row: 101 });
});

it('keeps building on the requested top until every request is answered', async () => {
  const { mode, scrolls, answer } = start();

  mode.handle({ kind: 'enter' });

  for (let count = 0; count < 4; count += 1) {
    mode.handle({ kind: 'move', motion: 'up' });
  }

  expect(scrolls).toEqual([99, 98]);

  await answer();
  mode.handle({ kind: 'move', motion: 'down' });

  expect(scrolls).toEqual([99, 98]);
  expect(mode.cursor()).toMatchObject({ row: 99 });
});

it('ends the mode and returns to insert mode when a motion finds the row cache gone', () => {
  const { mode, scrolls, modes, external } = start(undefined, 97);
  const { notifiedBy } = counted(mode);

  mode.handle({ kind: 'enter' });
  external.cached = false;

  const heard = notifiedBy(() => {
    mode.handle({ kind: 'move', motion: 'up' });
  });

  expect(heard).toBeGreaterThan(0);
  expect(modes).toEqual(['insert']);
  expect(mode.cursor()).toBeUndefined();
  expect(scrolls).toEqual([]);
});

it('falls back to normal mode when the focused pane is gone or has no row cache', () => {
  const gone = start();

  gone.external.removed = 1;
  gone.mode.handle({ kind: 'enter' });

  expect(gone.modes).toEqual(['normal']);
  expect(gone.mode.cursor()).toBeUndefined();

  const uncached = start();

  uncached.external.cached = false;
  uncached.mode.handle({ kind: 'enter' });

  expect(uncached.modes).toEqual(['normal']);
  expect(uncached.mode.cursor()).toBeUndefined();
});

it('leaves to the bottom when no history is left above the active top', () => {
  const { mode, arrive, scrolls } = start(undefined, 97);

  mode.handle({ kind: 'enter' });
  arrive({ ...updateOf([100, 101, 102]), sequence: 2, first: activeTop });
  mode.handle({ kind: 'leave' });

  expect(scrolls).toEqual([]);
});

it('ends the mode and returns to insert mode when the shown pane is removed', () => {
  const { mode, modes, show, external } = start();
  const { notifiedBy } = counted(mode);

  mode.handle({ kind: 'enter' });

  expect(
    notifiedBy(() => {
      show({ removePane: 1 });
    }),
  ).toBeGreaterThan(0);

  expect(modes).toEqual(['insert']);
  expect(mode.cursor()).toBeUndefined();

  external.removed = undefined;
  show({});

  expect(modes).toEqual(['insert']);
});

it('leaves a mode that is not scroll alone when the shown pane is removed', () => {
  const { mode, modes, show, external } = start();

  mode.handle({ kind: 'enter' });
  external.inputMode = 'normal';
  show({ removePane: 1 });

  expect(modes).toEqual([]);
});

it("leaves scroll mode alone when a suspended pane is removed after another pane's scroll began", () => {
  const { mode, modes, show, external } = start();

  mode.handle({ kind: 'enter' });
  show({ focused: 2 });
  external.inputMode = 'scroll';
  show({ removePane: 1 });

  expect(modes).toEqual(['insert']);
});
