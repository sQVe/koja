import { expect, it } from 'bun:test';

import { paneId, tabId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { masterPanes } from '../layout.ts';
import { applyIntent } from './store.ts';
import type { Change, Intent, State } from './store.ts';
import {
  addPane,
  attachLarge,
  createKoja,
  createTab,
  defined,
  intent,
  runLegacy,
  splitFirst,
  switchLayout,
  zoom,
} from './storeFixtures.ts';

const identities = (state: State) =>
  state.panes.map((pane) => ({ id: pane.id, generation: pane.generation }));

const threePanes = (): State =>
  runLegacy([createKoja, attachLarge, splitFirst('right'), splitFirst('below')]);

const masterWith = (count: number): State => {
  const master = intent(runLegacy([createKoja, attachLarge]), switchLayout(1, 'master')).state;

  return Array.from({ length: count - 1 }).reduce<State>(
    (state) => intent(state, addPane(1)).state,
    master,
  );
};

const rotate = (id: number, direction: 'forward' | 'backward'): Intent => ({
  type: 'rotatePanes',
  paneId: paneId(id),
  direction,
});

const orderOf = (state: State): readonly PaneId[] => defined(state.tabs[0]).arrangement.order;

const focusedOf = (state: State): PaneId | undefined => defined(state.tabs[0]).focusedPaneId;

const focusAndZoomChanges = (changes: readonly Change[]) =>
  changes.filter((change) => change.type === 'paneFocused' || change.type === 'tabZoomChanged');

it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
  'rotates %i master panes forward and backward back to the original order',
  (count) => {
    const start = masterWith(count);
    const original = orderOf(start);
    const forward = intent(start, rotate(1, 'forward')).state;

    expect(orderOf(forward)).toEqual([...original.slice(1), ...original.slice(0, 1)]);
    expect(focusedOf(forward)).toBe(orderOf(forward)[0]);

    const backward = intent(forward, rotate(1, 'backward')).state;

    expect(orderOf(backward)).toEqual(original);
    expect(focusedOf(backward)).toBe(original[0]);
  },
);

it('keeps a lone master pane without a change', () => {
  const state = masterWith(1);
  const result = intent(state, rotate(1, 'forward'));

  expect(result.changes).toEqual([]);
  expect(result.state.tabs).toEqual(state.tabs);
});

it('refuses to rotate the panes of a legacy tab and keeps the state', () => {
  const state = threePanes();

  expect(applyIntent(state, rotate(1, 'forward'))).toEqual({
    kind: 'rejected',
    state,
    reason: 'requiresMasterLayout',
  });
});

it('zooms the new master when a zoomed master tab rotates, and keeps the layout tree', () => {
  const zoomed = intent(masterWith(3), zoom(1)).state;
  const before = defined(zoomed.tabs[0]);
  const result = intent(zoomed, rotate(1, 'forward'));
  const tab = defined(result.state.tabs[0]);

  expect(tab.arrangement.order).toEqual([paneId(2), paneId(3), paneId(1)]);
  expect(tab.focusedPaneId).toBe(paneId(2));
  expect(tab.zoomedPaneId).toBe(paneId(2));
  expect(tab.layout).toEqual(before.layout);

  expect(result.changes).toContainEqual({
    type: 'tabZoomChanged',
    tabId: tabId(1),
    zoomedPaneId: paneId(2),
  });
});

it('switches a tab to master and back with the same panes, focus, and zoom', () => {
  const legacy = intent(threePanes(), zoom(2)).state;
  const before = defined(legacy.tabs[0]);
  const master = intent(legacy, switchLayout(1, 'master'));
  const masterTab = defined(master.state.tabs[0]);

  expect(masterTab).toEqual({
    ...before,
    arrangement: { ...before.arrangement, choice: 'master' },
  });

  expect(identities(master.state)).toEqual(identities(legacy));

  expect(master.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(1),
    layout: before.layout,
    arrangement: masterTab.arrangement,
  });

  const back = intent(master.state, switchLayout(1, 'legacy')).state;

  expect(back.tabs[0]).toEqual(before);
  expect(identities(back)).toEqual(identities(legacy));
});

it('sizes the panes of a switched tab from the master order', () => {
  const result = intent(threePanes(), switchLayout(1, 'master'));
  const { order } = defined(result.state.tabs[0]).arrangement;
  const placed = masterPanes(order, result.state.layoutArea);

  expect(placed.ok).toBe(true);

  const expected = placed.ok
    ? placed.panes.map((rectangle) => [
        rectangle.paneId,
        rectangle.terminal.columns,
        rectangle.terminal.rows,
      ])
    : [];

  const sizes = order.map((id) => {
    const pane = defined(result.state.panes.find((known) => known.id === id));

    return [id, pane.size.columns, pane.size.rows];
  });

  expect(sizes).toEqual(expected);
});

it('switches back to the sizes of the legacy tree', () => {
  const legacy = threePanes();
  const master = intent(legacy, switchLayout(1, 'master')).state;

  expect(intent(master, switchLayout(1, 'legacy')).state.panes).toEqual(legacy.panes);
});

it('keeps a tab that already uses the choice and reports no change', () => {
  const state = threePanes();
  const result = intent(state, switchLayout(1, 'legacy'));

  expect(result.changes).toEqual([]);
  expect(result.state.tabs).toBe(state.tabs);
});

it('refuses to switch a tab that does not exist', () => {
  const state = threePanes();

  expect(
    applyIntent(state, {
      type: 'setTabLayout',
      tabId: tabId(9),
      choice: 'master',
    }),
  ).toEqual({
    kind: 'rejected',
    state,
    reason: 'unknownTab',
  });
});

it('refuses to switch a tab while the server stops', () => {
  const state = intent(threePanes(), { type: 'stopServer' }).state;

  expect(applyIntent(state, switchLayout(1, 'master'))).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

it('switches only the given tab', () => {
  const state = runLegacy([createKoja, attachLarge, createTab]);
  const result = intent(state, switchLayout(2, 'master'));

  expect(result.state.tabs.map((tab) => tab.arrangement.choice)).toEqual(['legacy', 'master']);
});

it('rotates only the target tab and leaves the other tabs as they were', () => {
  const state = intent(masterWith(3), createTab).state;
  const otherBefore = state.tabs[1];
  const result = intent(state, rotate(1, 'forward'));

  expect(orderOf(result.state)).toEqual([paneId(2), paneId(3), paneId(1)]);
  expect(result.state.tabs[1]).toEqual(otherBefore);

  expect(result.changes.filter((change) => 'tabId' in change && change.tabId === tabId(2))).toEqual(
    [],
  );
});

it('publishes the new layout arrangement and the focus change of an unzoomed tab', () => {
  const state = intent(masterWith(3), { type: 'focusPane', paneId: paneId(1) }).state;
  const before = defined(state.tabs[0]);
  const result = intent(state, rotate(1, 'forward'));
  const tab = defined(result.state.tabs[0]);

  expect(result.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(1),
    layout: before.layout,
    arrangement: tab.arrangement,
  });

  expect(focusAndZoomChanges(result.changes)).toEqual([
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(2) },
  ]);
});

it('publishes no focus or zoom change when the new master already has both', () => {
  const state = intent(masterWith(3), zoom(2)).state;
  const result = intent(state, rotate(1, 'forward'));
  const tab = defined(result.state.tabs[0]);

  expect(tab.focusedPaneId).toBe(paneId(2));
  expect(tab.zoomedPaneId).toBe(paneId(2));
  expect(focusAndZoomChanges(result.changes)).toEqual([]);
});
