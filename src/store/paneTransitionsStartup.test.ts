import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import type { State } from './store.ts';
import {
  addPane,
  attachLarge,
  createKoja,
  defined,
  fact,
  intent,
  run,
  zoom,
} from './storeFixtures.ts';

const runningPair = (): State => {
  const created = run([createKoja, attachLarge, addPane(1)]);

  return created.panes.reduce(
    (state, pane) =>
      fact(state, {
        type: 'paneStarted',
        paneId: pane.id,
        generation: pane.generation,
      }).state,
    created,
  );
};

it('restores focus and zoom after a master add fails with running survivors', () => {
  const before = intent(runningPair(), zoom(1)).state;
  const added = intent(before, addPane(1)).state;
  const pane = defined(added.panes.find((known) => known.id === paneId(3)));

  const result = fact(added, {
    type: 'paneFailedToStart',
    paneId: pane.id,
    generation: pane.generation,
    message: 'Unavailable working directory',
  });

  const tab = defined(result.state.tabs[0]);

  expect(tab.focusedPaneId).toBe(paneId(1));
  expect(tab.zoomedPaneId).toBe(paneId(1));
  expect(tab.arrangement.order).toEqual([paneId(1), paneId(2)]);
  expect(result.state.panes.map((survivor) => survivor.id)).toEqual([paneId(1), paneId(2)]);
  expect(result.state.panes.every((survivor) => survivor.lifecycle === 'running')).toBe(true);
  expect(result.state.stateBeforeSplit.size).toBe(0);
});

it('keeps a newer selection and zoom when an unselected master add fails', () => {
  const before = intent(runningPair(), zoom(1)).state;
  const added = intent(before, addPane(1)).state;
  const moved = intent(added, zoom(2)).state;

  const result = fact(moved, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'Unavailable working directory',
  });

  const tab = defined(result.state.tabs[0]);

  expect(tab.focusedPaneId).toBe(paneId(2));
  expect(tab.zoomedPaneId).toBe(paneId(2));
  expect(tab.arrangement.order).toEqual([paneId(1), paneId(2)]);
});

it('focuses and zooms a surviving successor when the focus saved before a master add has closed', () => {
  const before = intent(runningPair(), zoom(1)).state;
  const added = intent(before, addPane(1)).state;
  const closed = intent(added, { type: 'closePane', paneId: paneId(1) }).state;

  const result = fact(closed, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'Unavailable working directory',
  });

  const tab = defined(result.state.tabs[0]);

  expect(tab.focusedPaneId).toBe(paneId(2));
  expect(tab.zoomedPaneId).toBe(paneId(2));
  expect(tab.arrangement.order).toEqual([paneId(2)]);
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(2)]);
});

it('focuses and zooms the close successor rather than restoring saved focus when a new master pane exits', () => {
  const before = intent(runningPair(), zoom(1)).state;
  const added = intent(before, addPane(1)).state;
  const result = fact(added, { type: 'paneExited', paneId: paneId(3), generation: 3, exitCode: 0 });
  const tab = defined(result.state.tabs[0]);

  expect(tab.focusedPaneId).toBe(paneId(2));
  expect(tab.zoomedPaneId).toBe(paneId(2));
  expect(tab.arrangement.order).toEqual([paneId(1), paneId(2)]);
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);
});
