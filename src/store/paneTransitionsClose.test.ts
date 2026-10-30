import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { layoutPaneIds } from '../layout.ts';
import type { State } from './store.ts';
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

const threePaneMaster = (): State =>
  runLegacy([createKoja, attachLarge, splitFirst('right'), switchLayout(1, 'master'), addPane(1)]);

const focusThenClose = (state: State, focus: number, close: number): State => {
  const focused = intent(state, { type: 'focusPane', paneId: paneId(focus) }).state;

  return intent(focused, { type: 'closePane', paneId: paneId(close) }).state;
};

const expectClosed = (
  state: State,
  expected: { focused: number; order: readonly number[] },
): void => {
  const tab = defined(state.tabs[0]);
  const survivors = expected.order.map((id) => paneId(id));

  expect(tab.focusedPaneId).toBe(paneId(expected.focused));
  expect(tab.arrangement.order).toEqual(survivors);
  expect(layoutPaneIds(tab.layout).toSorted()).toEqual(survivors.toSorted());
  expect(state.panes.map((pane) => pane.id).toSorted()).toEqual(survivors.toSorted());
};

it('closing the master selects the promoted pane', () => {
  const state = focusThenClose(threePaneMaster(), 1, 1);

  expectClosed(state, { focused: 2, order: [2, 3] });
});

it('closing the selected middle pane of a master tab selects the pane that takes its place', () => {
  const state = focusThenClose(threePaneMaster(), 2, 2);

  expectClosed(state, { focused: 3, order: [1, 3] });
});

it('closing the selected last pane of a master tab selects its predecessor', () => {
  const state = focusThenClose(threePaneMaster(), 3, 3);

  expectClosed(state, { focused: 2, order: [1, 2] });
});

it('closing an unselected pane of a master tab keeps the selection', () => {
  const state = focusThenClose(threePaneMaster(), 1, 3);

  expectClosed(state, { focused: 1, order: [1, 2] });
});

it('keeps the zoom on the new selection when a zoomed selected pane closes', () => {
  const legacy = intent(runLegacy([createKoja, attachLarge, splitFirst('right'), zoom(1)]), {
    type: 'closePane',
    paneId: paneId(1),
  }).state;

  const master = intent(intent(threePaneMaster(), zoom(1)).state, {
    type: 'closePane',
    paneId: paneId(1),
  }).state;

  expect(defined(legacy.tabs[0]).focusedPaneId).toBe(paneId(2));
  expect(defined(legacy.tabs[0]).zoomedPaneId).toBe(paneId(2));

  expect(defined(master.tabs[0]).focusedPaneId).toBe(paneId(2));
  expect(defined(master.tabs[0]).zoomedPaneId).toBe(paneId(2));
});

it('keeps the zoom when an unselected pane closes', () => {
  const legacy = intent(runLegacy([createKoja, attachLarge, splitFirst('right'), zoom(1)]), {
    type: 'closePane',
    paneId: paneId(2),
  }).state;

  const master = intent(intent(threePaneMaster(), zoom(1)).state, {
    type: 'closePane',
    paneId: paneId(3),
  }).state;

  expect(defined(legacy.tabs[0]).focusedPaneId).toBe(paneId(1));
  expect(defined(legacy.tabs[0]).zoomedPaneId).toBe(paneId(1));

  expect(defined(master.tabs[0]).focusedPaneId).toBe(paneId(1));
  expect(defined(master.tabs[0]).zoomedPaneId).toBe(paneId(1));
});
