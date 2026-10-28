import { expect, it } from 'bun:test';

import type { StoreSnapshot } from '../client/client.ts';
import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { ModeFlag } from '../rows/rows.ts';
import { firstWorkspace, storeSnapshotOf } from './inputFixtures.ts';
import { createMouseCapture } from './mouseCapture.ts';
import type { MouseEvent } from './mouseEncoding.ts';
import type { PaneTarget } from './screenTargets.ts';

interface Forwarded {
  kind: MouseEvent['kind'];
  button: number;
  target: PaneTarget;
}

const left = paneId(1);
const right = paneId(2);

const mouse = (kind: MouseEvent['kind'], button: number, x = 0, y = 0): MouseEvent => ({
  kind,
  button,
  shift: false,
  alt: false,
  ctrl: false,
  x,
  y,
});

const setup = () => {
  const sizes = new Map<PaneId, { columns: number; rows: number }>([
    [left, { columns: 10, rows: 5 }],
  ]);

  const unplaced = new Set<PaneId>();
  const forwarded: Forwarded[] = [];
  const pane = { accepts: true };
  const store = { current: storeSnapshotOf({ ids: [firstWorkspace], focused: firstWorkspace }) };

  const capture = createMouseCapture({
    snapshot: () => store.current,
    // Cells with x below 10 belong to the left pane, the others to the right pane.
    mouseTarget: (x, y, bound) => {
      if (bound !== undefined && unplaced.has(bound)) {
        return undefined;
      }

      const target: PaneTarget =
        x < 10 ? { paneId: left, column: x, row: y } : { paneId: right, column: x - 10, row: y };

      return bound === undefined || bound === target.paneId
        ? target
        : { paneId: bound, column: 0, row: y };
    },
    paneSize: (known) => sizes.get(known),
    paneModes: () => 0,
    forward: (event, target) => {
      if (pane.accepts) {
        forwarded.push({ kind: event.kind, button: event.button, target });
      }

      return pane.accepts;
    },
  });

  return { sizes, unplaced, forwarded, pane, store, capture };
};

const withGeneration = (
  snapshot: StoreSnapshot,
  pane: PaneId,
  generation: number,
): StoreSnapshot => ({
  ...snapshot,
  panes: snapshot.panes.map((known) => (known.id === pane ? { ...known, generation } : known)),
});

it('sends the drag and release of a captured press to its pane, even over another pane', () => {
  const { forwarded, capture } = setup();

  expect(capture.advance(mouse('press', 0, 2, 1), true)).toEqual({
    startsPress: true,
    pressed: { paneId: left, column: 2, row: 1 },
  });

  capture.advance(mouse('drag', 0, 12, 2), true);
  capture.advance(mouse('release', 0, 12, 2), true);

  expect(forwarded).toEqual([
    { kind: 'press', button: 0, target: { paneId: left, column: 2, row: 1 } },
    { kind: 'drag', button: 0, target: { paneId: left, column: 0, row: 2 } },
    { kind: 'release', button: 0, target: { paneId: left, column: 0, row: 2 } },
  ]);
});

it('does not begin a second gesture or send another button while one is captured', () => {
  const { forwarded, capture } = setup();

  capture.advance(mouse('press', 0, 2, 1), true);

  expect(capture.advance(mouse('press', 2, 12, 1), true)).toEqual({
    startsPress: false,
    pressed: undefined,
  });

  capture.advance(mouse('drag', 2, 12, 1), true);
  capture.advance(mouse('release', 2, 12, 1), true);

  expect(forwarded.map((entry) => entry.kind)).toEqual(['press']);
});

it('sends a second press of the held button to the pane under the pointer', () => {
  const { forwarded, capture } = setup();

  capture.advance(mouse('press', 0, 2, 1), true);

  expect(capture.advance(mouse('press', 0, 12, 1), true).startsPress).toBe(false);

  expect(forwarded.at(-1)).toEqual({
    kind: 'press',
    button: 0,
    target: { paneId: right, column: 2, row: 1 },
  });
});

it('does not begin a gesture from a drag', () => {
  const { capture } = setup();

  expect(capture.advance(mouse('drag', 0, 2, 1), true).startsPress).toBe(false);
});

it('sends a wheel during a gesture to the pane under the pointer', () => {
  const { forwarded, capture } = setup();

  capture.advance(mouse('press', 0, 2, 1), true);
  capture.advance(mouse('wheel', 64, 12, 1), true);

  expect(forwarded.at(-1)).toEqual({
    kind: 'wheel',
    button: 64,
    target: { paneId: right, column: 2, row: 1 },
  });
});

it('sends an event outside a gesture only when the mode sends it', () => {
  const { forwarded, capture } = setup();

  capture.advance(mouse('drag', 2, 12, 1), false);
  capture.advance(mouse('motion', 3, 12, 1), true);

  expect(forwarded).toEqual([
    { kind: 'motion', button: 3, target: { paneId: right, column: 2, row: 1 } },
  ]);
});

it('withholds the gesture of a press the mode does not send, even once the mode sends', () => {
  const { forwarded, capture } = setup();

  capture.advance(mouse('press', 0, 2, 1), false);
  capture.advance(mouse('drag', 0, 3, 1), true);
  capture.advance(mouse('release', 0, 3, 1), true);

  expect(forwarded).toEqual([]);
});

it('sends the gesture of a delivered press after the mode stops sending', () => {
  const { forwarded, capture } = setup();

  capture.advance(mouse('press', 0, 2, 1), true);
  capture.advance(mouse('drag', 0, 3, 1), false);
  capture.advance(mouse('release', 0, 3, 1), false);

  expect(forwarded.map((entry) => entry.kind)).toEqual(['press', 'drag', 'release']);
});

it('withholds the gesture of a press that sent the pane no bytes', () => {
  const { forwarded, pane, capture } = setup();

  pane.accepts = false;
  capture.advance(mouse('press', 0, 2, 1), true);
  pane.accepts = true;
  capture.advance(mouse('drag', 0, 3, 1), true);
  capture.advance(mouse('release', 0, 3, 1), true);

  expect(forwarded).toEqual([]);
});

it('withholds the rest of a gesture once its pane runs another generation', () => {
  const { forwarded, store, capture } = setup();

  capture.advance(mouse('press', 0, 2, 1), true);
  store.current = withGeneration(store.current, left, 2);
  capture.advance(mouse('drag', 0, 3, 1), true);
  store.current = withGeneration(store.current, left, 1);
  capture.advance(mouse('release', 0, 3, 1), true);

  expect(forwarded.map((entry) => entry.kind)).toEqual(['press']);
});

it('sends an unplaced release at the last cell, clamped to the current pane size', () => {
  const { sizes, unplaced, forwarded, capture } = setup();

  capture.advance(mouse('press', 0, 8, 4), true);
  unplaced.add(left);
  sizes.set(left, { columns: 4, rows: 2 });
  capture.advance(mouse('drag', 0, 50, 50), true);
  capture.advance(mouse('release', 0, 50, 50), true);

  expect(forwarded.slice(1)).toEqual([
    { kind: 'release', button: 0, target: { paneId: left, column: 3, row: 1 } },
  ]);
});

it('sends no unplaced release once the pane is gone, and ends the gesture', () => {
  const { sizes, unplaced, forwarded, capture } = setup();

  capture.advance(mouse('press', 0, 8, 4), true);
  unplaced.add(left);
  sizes.delete(left);
  capture.advance(mouse('release', 0, 8, 4), true);

  expect(forwarded.map((entry) => entry.kind)).toEqual(['press']);
  expect(capture.advance(mouse('press', 2, 12, 1), true).startsPress).toBe(true);
});

it('starts a new gesture after the release', () => {
  const { capture } = setup();

  capture.advance(mouse('press', 0, 2, 1), true);
  capture.advance(mouse('release', 0, 2, 1), true);

  expect(capture.advance(mouse('press', 2, 12, 1), true).startsPress).toBe(true);
});

it('releases a delivered gesture now at its clamped last cell and ends it', () => {
  const { sizes, forwarded, capture } = setup();

  capture.advance(mouse('press', 2, 8, 4), true);
  sizes.set(left, { columns: 4, rows: 2 });
  capture.releaseNow();
  capture.releaseNow();

  expect(forwarded.slice(1)).toEqual([
    { kind: 'release', button: 2, target: { paneId: left, column: 3, row: 1 } },
  ]);

  expect(capture.advance(mouse('press', 0, 2, 1), true).startsPress).toBe(true);
});

it('releases nothing now for a withheld gesture and still ends it', () => {
  const { forwarded, capture } = setup();

  capture.advance(mouse('press', 0, 8, 4), false);
  capture.releaseNow();

  expect(forwarded).toEqual([]);
  expect(capture.advance(mouse('press', 0, 2, 1), true).startsPress).toBe(true);
});

it('releases nothing now once the pane runs another generation', () => {
  const { forwarded, store, capture } = setup();

  capture.advance(mouse('press', 0, 8, 4), true);
  store.current = withGeneration(store.current, left, 2);
  capture.releaseNow();

  expect(forwarded.map((entry) => entry.kind)).toEqual(['press']);
});

it('sends the drag and release with the modes the press started with, once the pane has none', () => {
  const modesSent: number[] = [];
  const paneModes = { current: ModeFlag.buttonMouse | ModeFlag.sgrMouse };

  const capture = createMouseCapture({
    snapshot: () => storeSnapshotOf({ ids: [firstWorkspace], focused: firstWorkspace }),
    mouseTarget: (x, y) => ({ paneId: left, column: x, row: y }),
    paneSize: () => ({ columns: 10, rows: 5 }),
    paneModes: () => paneModes.current,
    forward: (_event, _target, modes) => {
      modesSent.push(modes);

      return true;
    },
  });

  capture.advance(mouse('press', 0, 2, 1), true);
  paneModes.current = 0;
  capture.advance(mouse('drag', 0, 3, 1), true);
  capture.advance(mouse('release', 0, 3, 1), true);

  expect(modesSent).toEqual([
    ModeFlag.buttonMouse | ModeFlag.sgrMouse,
    ModeFlag.buttonMouse | ModeFlag.sgrMouse,
    ModeFlag.buttonMouse | ModeFlag.sgrMouse,
  ]);
});
