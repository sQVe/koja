import { expect, it } from 'bun:test';

import { tabId } from '../ids.ts';
import { masterPanes } from '../layout.ts';
import { applyIntent } from './store.ts';
import type { State } from './store.ts';
import {
  attachLarge,
  createKoja,
  createTab,
  defined,
  intent,
  run,
  splitFirst,
  switchLayout,
  zoom,
} from './storeFixtures.ts';

const identities = (state: State) =>
  state.panes.map((pane) => ({ id: pane.id, generation: pane.generation }));

const threePanes = (): State =>
  run([createKoja, attachLarge, splitFirst('right'), splitFirst('below')]);

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
  const state = run([createKoja, attachLarge, createTab]);
  const result = intent(state, switchLayout(2, 'master'));

  expect(result.state.tabs.map((tab) => tab.arrangement.choice)).toEqual(['legacy', 'master']);
});
