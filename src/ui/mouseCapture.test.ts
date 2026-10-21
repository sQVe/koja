import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { createMouseCapture } from './mouseCapture.ts';
import type { MouseEvent } from './mouseEncoding.ts';
import type { PaneTarget } from './screenTargets.ts';

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

  const lookups: (PaneId | undefined)[] = [];

  const capture = createMouseCapture({
    // Cells with x below 10 belong to the left pane, the others to the right pane.
    mouseTarget: (x, y, pane) => {
      lookups.push(pane);

      const target: PaneTarget =
        x < 10 ? { paneId: left, column: x, row: y } : { paneId: right, column: x - 10, row: y };

      return pane === undefined || pane === target.paneId
        ? target
        : { paneId: pane, column: 0, row: y };
    },
    paneSize: (pane) => sizes.get(pane),
  });

  return { sizes, lookups, capture };
};

it('captures the button and pane of a press and sends drags and release there', () => {
  const { capture } = setup();
  const press = mouse('press', 0, 2, 1);

  expect(capture.begin(press)).toBe(true);

  const drag = mouse('drag', 0, 12, 2);

  expect(capture.targetOf(drag)).toEqual({ paneId: left, column: 0, row: 2 });
});

it('does not begin a second gesture while one is captured', () => {
  const { capture } = setup();

  expect(capture.begin(mouse('press', 0, 2, 1))).toBe(true);
  expect(capture.begin(mouse('press', 2, 12, 1))).toBe(false);
});

it('does not begin a gesture from a drag', () => {
  const { capture } = setup();

  expect(capture.begin(mouse('drag', 0, 2, 1))).toBe(false);
});

it('ignores gesture events of other buttons while a button is captured', () => {
  const { capture } = setup();

  capture.begin(mouse('press', 0, 2, 1));

  expect(capture.ignores(mouse('drag', 2))).toBe(true);
  expect(capture.ignores(mouse('release', 2))).toBe(true);
  expect(capture.ignores(mouse('drag', 0))).toBe(false);
  expect(capture.ignores(mouse('wheel', 64))).toBe(false);
});

it('ignores nothing before a press', () => {
  const { capture } = setup();

  expect(capture.ignores(mouse('drag', 2))).toBe(false);
});

it('clamps an unplaced release to the current pane size', () => {
  const { sizes, capture } = setup();
  const press = mouse('press', 0, 8, 4);

  capture.begin(press);
  capture.finish(press, capture.targetOf(press));
  sizes.set(left, { columns: 4, rows: 2 });

  const release = mouse('release', 0, 50, 50);
  const unplaced = capture.unplacedRelease(release);

  expect(unplaced).toEqual({ paneId: left, column: 3, row: 1 });
});

it('gives no unplaced target once the pane is gone', () => {
  const { sizes, capture } = setup();
  const press = mouse('press', 0, 8, 4);

  capture.begin(press);
  capture.finish(press, capture.targetOf(press));
  sizes.delete(left);

  expect(capture.unplacedRelease(mouse('release', 0))).toBeUndefined();
});

it('gives no unplaced target for a drag', () => {
  const { capture } = setup();
  const press = mouse('press', 0, 8, 4);

  capture.begin(press);
  capture.finish(press, capture.targetOf(press));

  expect(capture.unplacedRelease(mouse('drag', 0))).toBeUndefined();
});

it('starts a new gesture after the release', () => {
  const { capture } = setup();
  const press = mouse('press', 0, 2, 1);

  capture.begin(press);
  capture.finish(mouse('release', 0, 2, 1), { paneId: left, column: 2, row: 1 });

  expect(capture.begin(mouse('press', 2, 12, 1))).toBe(true);
});
