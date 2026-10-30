import { describe, expect, it } from 'bun:test';

import { clientId, paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { layoutPanes, masterPanes } from '../layout.ts';
import type { Layout, PaneRectangle, ResizeDirection, TerminalSize } from '../layout.ts';
import { paneInDirection } from './paneNavigationTransitions.ts';
import { applyIntent } from './store.ts';
import type { Intent, State } from './store.ts';
import {
  addPane,
  attachLarge,
  createKoja,
  defined,
  intent,
  runLegacy,
  splitFirst,
  switchLayout,
  zoom,
} from './storeFixtures.ts';

type Move = [from: number, direction: ResizeDirection, to: number | undefined];

const size: TerminalSize = { columns: 100, rows: 30 };

const directions: ResizeDirection[] = ['left', 'right', 'up', 'down'];

const optionalPaneId = (id: number | undefined): PaneId | undefined =>
  id === undefined ? undefined : paneId(id);

const masterGeometry = (paneCount: number): PaneRectangle[] => {
  const order = Array.from({ length: paneCount }, (_, index) => paneId(index + 1));
  const result = masterPanes(order, size);

  invariant(result.ok, 'Expected the test master panes to fit the test size.');

  return result.panes;
};

const rectangle = (
  id: number,
  x: number,
  y: number,
  columns: number,
  rows: number,
): PaneRectangle => ({
  paneId: paneId(id),
  x,
  y,
  columns,
  rows,
  terminal: { x, y, columns, rows },
});

const movesIn = (panes: readonly PaneRectangle[], moves: Move[]): void => {
  it.each(moves)('from pane %i moving %s goes to %p', (from, direction, to) => {
    expect(paneInDirection(panes, paneId(from), direction)).toBe(optionalPaneId(to));
  });
};

const focusIn = (id: number, direction: ResizeDirection): Intent => ({
  type: 'focusPaneInDirection',
  paneId: paneId(id),
  direction,
});

const masterWith = (count: number): State => {
  const master = intent(runLegacy([createKoja, attachLarge]), switchLayout(1, 'master')).state;

  return Array.from({ length: count - 1 }).reduce<State>(
    (state) => intent(state, addPane(1)).state,
    master,
  );
};

const focusedOf = (state: State): PaneId | undefined => defined(state.tabs[0]).focusedPaneId;

describe('paneInDirection', () => {
  describe('a lone pane', () => {
    it.each(directions)('has no neighbor moving %s', (direction) => {
      expect(paneInDirection(masterGeometry(1), paneId(1), direction)).toBe(undefined);
    });
  });

  describe('a master tab with one right pane', () => {
    movesIn(masterGeometry(2), [
      [1, 'right', 2],
      [2, 'left', 1],
      [1, 'left', undefined],
      [1, 'up', undefined],
      [1, 'down', undefined],
      [2, 'up', undefined],
      [2, 'down', undefined],
      [2, 'right', undefined],
    ]);
  });

  describe('a master tab with three stacked right panes', () => {
    movesIn(masterGeometry(4), [
      [1, 'right', 2],
      [1, 'left', undefined],
      [1, 'up', undefined],
      [1, 'down', undefined],
      [2, 'left', 1],
      [2, 'up', undefined],
      [2, 'down', 3],
      [3, 'up', 2],
      [3, 'down', 4],
      [3, 'left', 1],
      [4, 'up', 3],
      [4, 'down', undefined],
      [4, 'right', undefined],
      [2, 'right', undefined],
      [3, 'right', undefined],
    ]);
  });

  describe('a master tab with four right panes in pairs', () => {
    movesIn(masterGeometry(5), [
      [1, 'right', 2],
      [2, 'right', 3],
      [3, 'right', undefined],
      [2, 'down', 4],
      [3, 'down', 5],
      [4, 'up', 2],
      [5, 'up', 3],
      [4, 'right', 5],
      [5, 'left', 4],
      [2, 'left', 1],
      [3, 'left', 2],
      [1, 'up', undefined],
      [1, 'down', undefined],
      [1, 'left', undefined],
      [2, 'up', undefined],
      [4, 'down', undefined],
      [5, 'down', undefined],
    ]);
  });

  describe('a master tab with five right panes ending in a wide row', () => {
    movesIn(masterGeometry(6), [
      [1, 'right', 2],
      [2, 'down', 4],
      [3, 'down', 5],
      [4, 'down', 6],
      [5, 'down', 6],
      [6, 'up', 4],
      [5, 'up', 3],
      [4, 'right', 5],
      [6, 'left', 1],
      [1, 'up', undefined],
      [1, 'down', undefined],
      [1, 'left', undefined],
      [2, 'up', undefined],
      [3, 'up', undefined],
      [3, 'right', undefined],
      [5, 'right', undefined],
      [6, 'right', undefined],
      [6, 'down', undefined],
    ]);
  });

  describe('a master tab with six right panes in pairs', () => {
    movesIn(masterGeometry(7), [
      [1, 'right', 2],
      [2, 'right', 3],
      [4, 'right', 5],
      [6, 'right', 7],
      [7, 'left', 6],
      [3, 'left', 2],
      [2, 'down', 4],
      [4, 'down', 6],
      [3, 'down', 5],
      [5, 'down', 7],
      [7, 'up', 5],
      [6, 'up', 4],
      [5, 'up', 3],
      [6, 'left', 1],
      [1, 'up', undefined],
      [1, 'down', undefined],
      [2, 'up', undefined],
      [3, 'up', undefined],
      [3, 'right', undefined],
      [7, 'right', undefined],
      [7, 'down', undefined],
      [6, 'down', undefined],
    ]);
  });

  describe('a master tab with seven right panes ending in a wide row', () => {
    movesIn(masterGeometry(8), [
      [1, 'right', 2],
      [4, 'right', 5],
      [6, 'down', 8],
      [7, 'down', 8],
      [5, 'down', 7],
      [8, 'up', 6],
      [7, 'up', 5],
      [8, 'left', 1],
      [1, 'up', undefined],
      [1, 'down', undefined],
      [1, 'left', undefined],
      [2, 'up', undefined],
      [3, 'right', undefined],
      [7, 'right', undefined],
      [8, 'right', undefined],
      [8, 'down', undefined],
    ]);
  });

  describe('a legacy split tree', () => {
    const layout: Layout = {
      kind: 'split',
      direction: 'right',
      ratio: 0.5,
      first: { kind: 'pane', paneId: paneId(1) },
      second: {
        kind: 'split',
        direction: 'below',
        ratio: 0.5,
        first: { kind: 'pane', paneId: paneId(2) },
        second: { kind: 'pane', paneId: paneId(3) },
      },
    };

    movesIn(layoutPanes(layout, size), [
      [1, 'right', 2],
      [2, 'down', 3],
      [3, 'up', 2],
      [3, 'left', 1],
      [2, 'left', 1],
      [2, 'right', undefined],
      [3, 'right', undefined],
      [1, 'left', undefined],
      [1, 'up', undefined],
      [1, 'down', undefined],
      [2, 'up', undefined],
      [3, 'down', undefined],
    ]);
  });

  describe('ties', () => {
    it('prefers the nearer pane over a larger overlap', () => {
      const panes = [
        rectangle(1, 0, 0, 10, 10),
        rectangle(2, 12, 0, 5, 10),
        rectangle(3, 11, 0, 5, 5),
      ];

      expect(paneInDirection(panes, paneId(1), 'right')).toBe(paneId(3));
    });

    it('prefers the larger overlap over a smaller y', () => {
      const panes = [
        rectangle(1, 0, 0, 10, 10),
        rectangle(2, 11, 0, 5, 2),
        rectangle(3, 11, 2, 5, 8),
      ];

      expect(paneInDirection(panes, paneId(1), 'right')).toBe(paneId(3));
    });

    it('breaks a full tie moving right by the smaller y, whatever the order', () => {
      const panes = [
        rectangle(1, 0, 0, 10, 10),
        rectangle(2, 11, 5, 5, 5),
        rectangle(3, 11, 0, 5, 5),
      ];

      expect(paneInDirection(panes, paneId(1), 'right')).toBe(paneId(3));
      expect(paneInDirection(panes.toReversed(), paneId(1), 'right')).toBe(paneId(3));
    });

    it('breaks a full tie moving up by the smaller x', () => {
      const panes = [
        rectangle(1, 0, 10, 10, 10),
        rectangle(2, 5, 0, 5, 10),
        rectangle(3, 0, 0, 5, 10),
      ];

      expect(paneInDirection(panes, paneId(1), 'up')).toBe(paneId(3));
    });
  });
});

describe('focusPaneInDirection', () => {
  it('moves focus to the neighbor in a master tab', () => {
    const state = masterWith(3);

    expect(focusedOf(intent(state, focusIn(1, 'right')).state)).toBe(paneId(2));
    expect(focusedOf(intent(state, focusIn(3, 'left')).state)).toBe(paneId(1));
  });

  it('refuses a move past an outer edge and keeps the state', () => {
    const state = masterWith(3);

    expect(applyIntent(state, focusIn(1, 'left'))).toEqual({
      kind: 'rejected',
      state,
      reason: 'noPaneInDirection',
    });
  });

  it('refuses an unknown pane', () => {
    const state = masterWith(3);

    expect(applyIntent(state, focusIn(99, 'right'))).toEqual({
      kind: 'rejected',
      state,
      reason: 'unknownPane',
    });
  });

  it('refuses while the server is stopping', () => {
    const state = intent(masterWith(3), { type: 'stopServer' }).state;

    expect(applyIntent(state, focusIn(1, 'right'))).toEqual({
      kind: 'rejected',
      state,
      reason: 'serverStopping',
    });
  });

  it('never changes the arrangement order or the layout', () => {
    const state = masterWith(6);
    const before = defined(state.tabs[0]);

    for (const id of [1, 2, 3, 4, 5, 6]) {
      for (const direction of directions) {
        const result = applyIntent(state, focusIn(id, direction));

        if (result.kind === 'applied') {
          const after = defined(result.state.tabs[0]);

          expect(after.layout).toEqual(before.layout);
          expect(after.arrangement.order).toEqual(before.arrangement.order);
        }
      }
    }
  });

  it('moves the zoom with the focus in a zoomed master tab', () => {
    const zoomed = intent(masterWith(3), zoom(1)).state;
    const before = defined(zoomed.tabs[0]);

    expect(before.zoomedPaneId).toBe(paneId(1));

    const after = defined(intent(zoomed, focusIn(1, 'right')).state.tabs[0]);

    expect(after.focusedPaneId).toBe(paneId(2));
    expect(after.zoomedPaneId).toBe(paneId(2));
    expect(after.layout).toEqual(before.layout);
    expect(after.arrangement.order).toEqual(before.arrangement.order);
  });

  it('moves the zoom with the focus in a zoomed legacy tab', () => {
    const zoomed = intent(runLegacy([createKoja, attachLarge, splitFirst('right')]), zoom(1)).state;
    const before = defined(zoomed.tabs[0]);

    expect(before.zoomedPaneId).toBe(paneId(1));

    const after = defined(intent(zoomed, focusIn(1, 'right')).state.tabs[0]);

    expect(after.focusedPaneId).toBe(paneId(2));
    expect(after.zoomedPaneId).toBe(paneId(2));
    expect(after.layout).toEqual(before.layout);
    expect(after.arrangement.order).toEqual(before.arrangement.order);
  });

  it('finds the neighbor in a master tab too small for its panes', () => {
    const resized = intent(masterWith(4), {
      type: 'resizeClient',
      clientId: clientId(1),
      size: { columns: 6, rows: 9 },
    }).state;

    expect(focusedOf(intent(resized, focusIn(1, 'right')).state)).toBe(paneId(2));
    expect(focusedOf(intent(resized, focusIn(2, 'down')).state)).toBe(paneId(3));
  });
});
