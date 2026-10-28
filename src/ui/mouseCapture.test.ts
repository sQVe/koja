import { expect, it } from 'bun:test';

import type { StoreSnapshot } from '../client/client.ts';
import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { firstWorkspace, storeSnapshotOf } from './inputFixtures.ts';
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
  const store = { current: storeSnapshotOf({ ids: [firstWorkspace], focused: firstWorkspace }) };

  const capture = createMouseCapture({
    snapshot: () => store.current,
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

  return { sizes, lookups, store, capture };
};

it('captures the button and pane of a press and sends drags and release there', () => {
  const { capture } = setup();
  const press = mouse('press', 0, 2, 1);

  expect(capture.begin(press, true)).toBe(true);

  const drag = mouse('drag', 0, 12, 2);

  expect(capture.targetOf(drag)).toEqual({ paneId: left, column: 0, row: 2 });
});

it('does not begin a second gesture while one is captured', () => {
  const { capture } = setup();

  expect(capture.begin(mouse('press', 0, 2, 1), true)).toBe(true);
  expect(capture.begin(mouse('press', 2, 12, 1), true)).toBe(false);
});

it('does not begin a gesture from a drag', () => {
  const { capture } = setup();

  expect(capture.begin(mouse('drag', 0, 2, 1), true)).toBe(false);
});

it('ignores gesture events of other buttons while a button is captured', () => {
  const { capture } = setup();

  capture.begin(mouse('press', 0, 2, 1), true);

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

  capture.begin(press, true);
  capture.finish(press, capture.targetOf(press));
  sizes.set(left, { columns: 4, rows: 2 });

  const release = mouse('release', 0, 50, 50);
  const unplaced = capture.unplacedRelease(release);

  expect(unplaced).toEqual({ paneId: left, column: 3, row: 1 });
});

it('gives no unplaced target once the pane is gone', () => {
  const { sizes, capture } = setup();
  const press = mouse('press', 0, 8, 4);

  capture.begin(press, true);
  capture.finish(press, capture.targetOf(press));
  sizes.delete(left);

  expect(capture.unplacedRelease(mouse('release', 0))).toBeUndefined();
});

it('gives no unplaced target for a drag', () => {
  const { capture } = setup();
  const press = mouse('press', 0, 8, 4);

  capture.begin(press, true);
  capture.finish(press, capture.targetOf(press));

  expect(capture.unplacedRelease(mouse('drag', 0))).toBeUndefined();
});

it('starts a new gesture after the release', () => {
  const { capture } = setup();
  const press = mouse('press', 0, 2, 1);

  capture.begin(press, true);
  capture.finish(mouse('release', 0, 2, 1), { paneId: left, column: 2, row: 1 });

  expect(capture.begin(mouse('press', 2, 12, 1), true)).toBe(true);
});

const withGeneration = (
  snapshot: StoreSnapshot,
  pane: PaneId,
  generation: number,
): StoreSnapshot => ({
  ...snapshot,
  panes: snapshot.panes.map((known) => (known.id === pane ? { ...known, generation } : known)),
});

it('delivers the drag of a delivered press and withholds the drag of a withheld press', () => {
  const delivered = setup();
  const withheld = setup();

  delivered.capture.begin(mouse('press', 0, 2, 1), true);
  withheld.capture.begin(mouse('press', 0, 2, 1), false);

  expect(delivered.capture.deliveryOf(mouse('drag', 0))).toBe('delivered');
  expect(withheld.capture.deliveryOf(mouse('drag', 0))).toBe('withheld');
});

it('belongs to no gesture for a wheel, for motion, or before a press', () => {
  const { capture } = setup();

  expect(capture.deliveryOf(mouse('release', 0))).toBe('none');

  capture.begin(mouse('press', 0, 2, 1), true);

  expect(capture.deliveryOf(mouse('wheel', 64))).toBe('none');
  expect(capture.deliveryOf(mouse('motion', 3))).toBe('none');
});

it('withholds the rest of a gesture once its pane runs another generation', () => {
  const { store, capture } = setup();

  capture.begin(mouse('press', 0, 2, 1), true);
  store.current = withGeneration(store.current, left, 2);

  expect(capture.deliveryOf(mouse('drag', 0))).toBe('withheld');

  store.current = withGeneration(store.current, left, 1);

  expect(capture.deliveryOf(mouse('release', 0))).toBe('withheld');
});

it('releases a delivered gesture at its clamped last cell and ends it', () => {
  const { sizes, capture } = setup();
  const press = mouse('press', 2, 8, 4);

  capture.begin(press, true);
  capture.finish(press, capture.targetOf(press));
  sizes.set(left, { columns: 4, rows: 2 });

  expect(capture.releaseNow()).toMatchObject({
    event: { kind: 'release', button: 2 },
    target: { paneId: left, column: 3, row: 1 },
  });

  expect(capture.releaseNow()).toBeUndefined();
  expect(capture.begin(mouse('press', 0, 2, 1), true)).toBe(true);
});

it('gives no release for a withheld gesture and still ends it', () => {
  const { capture } = setup();
  const press = mouse('press', 0, 8, 4);

  capture.begin(press, false);
  capture.finish(press, capture.targetOf(press));

  expect(capture.releaseNow()).toBeUndefined();
  expect(capture.begin(mouse('press', 0, 2, 1), true)).toBe(true);
});
