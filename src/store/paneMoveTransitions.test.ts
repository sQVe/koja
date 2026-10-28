import { expect, it } from 'bun:test';

import { paneId, tabId, workspaceId } from '../ids.ts';
import { activeTabOf, applyIntent, focusedPane } from './store.ts';
import type { Change, Intent, State } from './store.ts';
import {
  attachLarge,
  createDocs,
  createKoja,
  createTab,
  defined,
  fact,
  intent,
  run,
  splitFirst,
  switchLayout,
  zoom,
} from './storeFixtures.ts';

const move = (id: number, destination: Extract<Intent, { type: 'movePane' }>['destination']) =>
  ({ type: 'movePane', paneId: paneId(id), destination }) satisfies Intent;

const toTab = (id: number) => ({ kind: 'tab', tabId: tabId(id) }) as const;

const changeTypes = (changes: readonly Change[]): string[] => changes.map((change) => change.type);

const paneOf = (state: State, id: number) => state.panes.find((pane) => pane.id === paneId(id));

const refusalOf = (state: State, next: Intent) => {
  const result = applyIntent(state, next);

  expect(result.kind).toBe('rejected');
  expect(result.state).toBe(state);

  return result.kind === 'rejected' ? result.reason : undefined;
};

it('moves the only pane of a tab to another tab and keeps its identity', () => {
  const state = run([attachLarge, createKoja, createTab]);
  const before = paneOf(state, 1);
  const result = intent(state, move(1, toTab(2)));
  const moved = paneOf(result.state, 1);

  expect(moved).toMatchObject({ id: paneId(1), tabId: tabId(2), lifecycle: before?.lifecycle });
  expect(moved?.generation).toBe(before?.generation);
  expect(changeTypes(result.changes)).toContain('paneMoved');
  expect(changeTypes(result.changes)).toContain('tabRemoved');
  expect(changeTypes(result.changes)).not.toContain('paneRemoved');
  expect(changeTypes(result.changes)).not.toContain('paneAdded');
  expect(result.state.tabs.map((tab) => tab.id)).toEqual([tabId(2)]);
  expect(result.state.workspaces[0]?.tabIds).toEqual([tabId(2)]);
});

it('splits next to the focused pane of the destination tab and focuses the moved pane', () => {
  const state = run([attachLarge, createKoja, splitFirst('right'), createTab]);
  const result = intent(state, move(3, toTab(1)));
  const destination = result.state.tabs.find((tab) => tab.id === tabId(1));

  expect(destination?.focusedPaneId).toBe(paneId(3));

  expect(destination?.layout).toMatchObject({
    kind: 'split',
    first: { kind: 'pane', paneId: paneId(1) },
    second: { kind: 'split' },
  });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(focusedPane(result.state)?.id).toBe(paneId(3));
  expect(result.changes).toContainEqual({ type: 'paneMoved', paneId: paneId(3), tabId: tabId(1) });
});

it('moves a pane to a new tab of its workspace and repairs the source tab', () => {
  const state = run([attachLarge, createKoja, splitFirst('right')]);
  const result = intent(state, move(2, { kind: 'newTab' }));
  const source = result.state.tabs.find((tab) => tab.id === tabId(1));
  const created = result.state.tabs.find((tab) => tab.id === tabId(2));

  expect(paneOf(result.state, 2)).toMatchObject({ tabId: tabId(2), generation: 2 });

  expect(source).toMatchObject({
    layout: { kind: 'pane', paneId: paneId(1) },
    focusedPaneId: paneId(1),
  });

  expect(created).toMatchObject({ workspaceId: workspaceId(1), focusedPaneId: paneId(2) });
  expect(result.state.workspaces[0]?.tabIds).toEqual([tabId(1), tabId(2)]);
  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(2));
  expect(result.state.nextTabNumber).toBe(3);
  expect(changeTypes(result.changes)).not.toContain('paneRemoved');
  expect(changeTypes(result.changes)).not.toContain('paneAdded');
});

it('moves a pane to a new workspace and focuses it', () => {
  const state = run([attachLarge, createKoja, splitFirst('below')]);
  const result = intent(state, move(2, { kind: 'newWorkspace', root: '/work/moved' }));

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([
    workspaceId(1),
    workspaceId(2),
  ]);

  expect(result.state.workspaces[1]).toEqual({
    id: workspaceId(2),
    root: '/work/moved',
    label: 'moved',
    tabIds: [tabId(2)],
  });

  expect(paneOf(result.state, 2)).toMatchObject({ tabId: tabId(2), generation: 2 });
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
  expect(activeTabOf(result.state.defaultView, workspaceId(2))).toBe(tabId(2));
  expect(changeTypes(result.changes)).toContain('workspaceAdded');
  expect(changeTypes(result.changes)).not.toContain('paneRemoved');
});

it('closes the source workspace when the move empties it', () => {
  const state = run([attachLarge, createKoja, createDocs]);
  const result = intent(state, move(2, toTab(1)));

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(1)]);
  expect(result.state.tabs.map((tab) => tab.id)).toEqual([tabId(1)]);
  expect(paneOf(result.state, 2)).toMatchObject({ tabId: tabId(1), generation: 2 });
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  expect(result.changes).toContainEqual({
    type: 'workspaceRemoved',
    workspaceId: workspaceId(2),
    focusedWorkspaceId: workspaceId(1),
  });

  expect(changeTypes(result.changes)).not.toContain('paneRemoved');
});

it('refuses an unknown pane, an unknown tab, and the pane own tab', () => {
  const state = run([attachLarge, createKoja, createTab]);

  expect(refusalOf(state, move(9, toTab(1)))).toBe('unknownPane');
  expect(refusalOf(state, move(1, toTab(9)))).toBe('unknownTab');
  expect(refusalOf(state, move(1, toTab(1)))).toBe('sameTab');
});

it('refuses a split target that is too small', () => {
  const tiny: Intent = { type: 'attachClient', size: { columns: 2, rows: 3 } };
  const state = run([tiny, createKoja, createTab]);

  expect(refusalOf(state, move(1, toTab(2)))).toBe('paneTooSmall');
});

it('refuses a move while the server stops', () => {
  const state = run([attachLarge, createKoja, createTab, { type: 'stopServer' }]);

  expect(refusalOf(state, move(1, toTab(2)))).toBe('serverStopping');
});

it('does not bring the destination zoom back when a moved running pane closes', () => {
  const closeThird: Intent = { type: 'closePane', paneId: paneId(3) };
  const base = run([attachLarge, createKoja, splitFirst('right'), createTab, zoom(1)]);
  const running = fact(base, { type: 'paneStarted', paneId: paneId(3), generation: 3 }).state;
  const moved = intent(running, move(3, toTab(1))).state;
  const closed = intent(moved, closeThird).state;
  const destination = closed.tabs.find((tab) => tab.id === tabId(1));

  expect(destination?.zoomedPaneId).toBeUndefined();
  expect(destination?.focusedPaneId).toBe(paneId(1));
});

it('does not bring the destination zoom back when a moved running pane exits', () => {
  const base = run([attachLarge, createKoja, splitFirst('right'), createTab, zoom(1)]);
  const running = fact(base, { type: 'paneStarted', paneId: paneId(3), generation: 3 }).state;
  const moved = intent(running, move(3, toTab(1))).state;
  const exited = fact(moved, { type: 'paneExited', paneId: paneId(3), generation: 3, exitCode: 0 });

  expect(exited.state.panes.some((pane) => pane.id === paneId(3))).toBe(false);
  expect(exited.state.tabs.find((tab) => tab.id === tabId(1))?.zoomedPaneId).toBeUndefined();
});

const tabOf = (state: State, id: number) => state.tabs.find((tab) => tab.id === tabId(id));

it('moves only the pane it names', () => {
  const state = run([attachLarge, createKoja, splitFirst('right'), createTab]);
  const result = intent(state, move(3, toTab(1)));

  expect(result.state.panes.map((pane) => pane.tabId)).toEqual([tabId(1), tabId(1), tabId(1)]);

  const other = intent(state, move(1, toTab(2)));

  expect(other.state.panes.map((pane) => pane.tabId)).toEqual([tabId(2), tabId(1), tabId(2)]);
});

it('adds the new tab only to the workspace of the pane', () => {
  const state = run([attachLarge, createKoja, splitFirst('right'), createDocs]);
  const result = intent(state, move(2, { kind: 'newTab' }));

  expect(result.state.workspaces.map((workspace) => workspace.tabIds)).toEqual([
    [tabId(1), tabId(3)],
    [tabId(2)],
  ]);
});

it('reports the layout, focus, and move of a pane that joins a tab', () => {
  const state = run([attachLarge, createKoja, splitFirst('right'), createTab]);
  const result = intent(state, move(3, toTab(1)));
  const destination = tabOf(result.state, 1);

  expect(destination).toBeDefined();
  expect(result.changes).toContainEqual({ type: 'paneMoved', paneId: paneId(3), tabId: tabId(1) });

  expect(result.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(1),
    layout: defined(destination).layout,
    arrangement: defined(destination).arrangement,
  });

  expect(result.changes).toContainEqual({
    type: 'paneFocused',
    tabId: tabId(1),
    paneId: paneId(3),
  });
});

it('reports the new tab and the move of a pane that leaves for a new tab', () => {
  const state = run([attachLarge, createKoja, splitFirst('right')]);
  const result = intent(state, move(2, { kind: 'newTab' }));
  const created = tabOf(result.state, 2);

  expect(result.changes).toContainEqual({ type: 'tabAdded', tab: defined(created) });
  expect(result.changes).toContainEqual({ type: 'paneMoved', paneId: paneId(2), tabId: tabId(2) });
});

it('adds a workspace with its tab, counters, and changes when a pane moves to a new workspace', () => {
  const state = run([attachLarge, createKoja, splitFirst('below')]);
  const result = intent(state, move(2, { kind: 'newWorkspace', root: '/work/moved' }));
  const created = tabOf(result.state, 2);

  expect(result.state.tabs.map((tab) => tab.id)).toEqual([tabId(1), tabId(2)]);
  expect(result.state.nextWorkspaceNumber).toBe(3);
  expect(result.state.nextTabNumber).toBe(3);

  expect(result.changes).toContainEqual({
    type: 'workspaceAdded',
    workspace: defined(result.state.workspaces[1]),
    activeTabId: tabId(2),
    focusedWorkspaceId: workspaceId(1),
  });

  expect(result.changes).toContainEqual({ type: 'tabAdded', tab: defined(created) });
  expect(result.changes).toContainEqual({ type: 'paneMoved', paneId: paneId(2), tabId: tabId(2) });
});

it('drops the split record of a moved pane', () => {
  const state = run([attachLarge, createKoja, splitFirst('right')]);
  const result = intent(state, move(2, { kind: 'newTab' }));

  expect(state.stateBeforeSplit.has(paneId(2))).toBe(true);
  expect(result.state.stateBeforeSplit.has(paneId(2))).toBe(false);
});

it('restores the destination focus and zoom when a moved starting pane fails to start', () => {
  const state = run([attachLarge, createKoja, splitFirst('right'), zoom(1), createTab]);
  const moved = intent(state, move(3, toTab(1))).state;

  const result = fact(moved, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(tabOf(moved, 1)?.zoomedPaneId).toBeUndefined();
  expect(tabOf(result.state, 1)?.focusedPaneId).toBe(paneId(1));
  expect(tabOf(result.state, 1)?.zoomedPaneId).toBe(paneId(1));
});

it('refuses a move when the focused pane of the destination is too small', () => {
  const small: Intent = { type: 'attachClient', size: { columns: 40, rows: 9 } };

  const state = run([
    small,
    createKoja,
    splitFirst('right'),
    { type: 'splitPane', paneId: paneId(2), direction: 'below', folder: undefined },
    { type: 'splitPane', paneId: paneId(3), direction: 'right', folder: undefined },
    { type: 'splitPane', paneId: paneId(4), direction: 'right', folder: undefined },
    createTab,
  ]);

  expect(refusalOf(state, move(6, toTab(1)))).toBe('paneTooSmall');
});

const threePaneTab = (...more: readonly Intent[]) =>
  run([
    attachLarge,
    createKoja,
    splitFirst('right'),
    { type: 'splitPane', paneId: paneId(2), direction: 'below', folder: undefined },
    ...more,
  ]);

it('keeps the focus and reports no focus change when an unfocused pane leaves a tab', () => {
  const state = threePaneTab({ type: 'focusPane', paneId: paneId(3) });
  const result = intent(state, move(1, { kind: 'newTab' }));

  expect(tabOf(result.state, 1)?.focusedPaneId).toBe(paneId(3));

  expect(result.changes).not.toContainEqual(
    expect.objectContaining({ type: 'paneFocused', tabId: tabId(1) }),
  );
});

it('moves the focus to the sibling and reports the source layout when the focused pane leaves', () => {
  const state = threePaneTab();
  const result = intent(state, move(3, { kind: 'newTab' }));
  const source = tabOf(result.state, 1);

  expect(source?.focusedPaneId).toBe(paneId(2));

  expect(result.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(1),
    layout: defined(source).layout,
    arrangement: defined(source).arrangement,
  });

  expect(result.changes).toContainEqual({
    type: 'paneFocused',
    tabId: tabId(1),
    paneId: paneId(2),
  });
});

it('unzooms the source tab and reports it when the zoomed pane leaves', () => {
  const state = threePaneTab(zoom(3));
  const result = intent(state, move(3, { kind: 'newTab' }));

  expect(tabOf(result.state, 1)?.zoomedPaneId).toBeUndefined();

  expect(result.changes).toContainEqual({
    type: 'tabZoomChanged',
    tabId: tabId(1),
    zoomedPaneId: undefined,
  });
});

it('keeps the zoom of the source tab when another pane leaves', () => {
  const state = threePaneTab(zoom(3));
  const result = intent(state, move(1, { kind: 'newTab' }));

  expect(tabOf(result.state, 1)?.zoomedPaneId).toBe(paneId(3));
  expect(changeTypes(result.changes)).not.toContain('tabZoomChanged');
});

const arrangementOf = (state: State, id: number) => tabOf(state, id)?.arrangement;

it('keeps each tab order in step with its tree when a pane moves to another tab', () => {
  const state = run([attachLarge, createKoja, splitFirst('right'), createTab]);
  const result = intent(state, move(2, toTab(2)));

  expect(arrangementOf(result.state, 1)).toEqual({ choice: 'legacy', order: [paneId(1)] });

  expect(arrangementOf(result.state, 2)).toEqual({
    choice: 'legacy',
    order: [paneId(3), paneId(2)],
  });

  expect(result.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(1),
    layout: defined(tabOf(result.state, 1)).layout,
    arrangement: defined(arrangementOf(result.state, 1)),
  });

  expect(result.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(2),
    layout: defined(tabOf(result.state, 2)).layout,
    arrangement: defined(arrangementOf(result.state, 2)),
  });
});

it('keeps each tab order in step with its tree when a pane moves to a new tab', () => {
  const result = intent(threePaneTab(), move(2, { kind: 'newTab' }));

  expect(arrangementOf(result.state, 1)).toEqual({
    choice: 'legacy',
    order: [paneId(1), paneId(3)],
  });

  expect(arrangementOf(result.state, 2)).toEqual({ choice: 'legacy', order: [paneId(2)] });
});

it('starts the tab of a pane moved to a new workspace as legacy with that pane', () => {
  const state = run([attachLarge, createKoja, splitFirst('right')]);
  const result = intent(state, move(2, { kind: 'newWorkspace', root: '/work/docs' }));

  expect(arrangementOf(result.state, 1)).toEqual({ choice: 'legacy', order: [paneId(1)] });
  expect(arrangementOf(result.state, 2)).toEqual({ choice: 'legacy', order: [paneId(2)] });
});

it('appends a pane moved into a master tab to its order and focuses it', () => {
  const state = run([
    attachLarge,
    createKoja,
    splitFirst('right'),
    switchLayout(1, 'master'),
    { type: 'focusPane', paneId: paneId(1) },
    createTab,
  ]);

  const result = intent(state, move(3, toTab(1)));
  const destination = defined(result.state.tabs.find((tab) => tab.id === tabId(1)));

  expect(destination.arrangement).toEqual({
    choice: 'master',
    order: [paneId(1), paneId(2), paneId(3)],
  });

  expect(destination.focusedPaneId).toBe(paneId(3));
});
