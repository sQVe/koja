import { expect, it } from 'bun:test';

import { paneId, tabId, workspaceId } from '../ids.ts';
import { activeTabOf, applyIntent, focusedPane } from './store.ts';
import type { Change, Intent, State } from './store.ts';
import {
  attachLarge,
  createDocs,
  createPhi,
  createTab,
  fact,
  intent,
  run,
  splitFirst,
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
  const state = run([attachLarge, createPhi, createTab]);
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
  const state = run([attachLarge, createPhi, splitFirst('right'), createTab]);
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
  const state = run([attachLarge, createPhi, splitFirst('right')]);
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
  const state = run([attachLarge, createPhi, splitFirst('below')]);
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
  const state = run([attachLarge, createPhi, createDocs]);
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
  const state = run([attachLarge, createPhi, createTab]);

  expect(refusalOf(state, move(9, toTab(1)))).toBe('unknownPane');
  expect(refusalOf(state, move(1, toTab(9)))).toBe('unknownTab');
  expect(refusalOf(state, move(1, toTab(1)))).toBe('sameTab');
});

it('refuses a split target that is too small', () => {
  const tiny: Intent = { type: 'attachClient', size: { columns: 2, rows: 3 } };
  const state = run([tiny, createPhi, createTab]);

  expect(refusalOf(state, move(1, toTab(2)))).toBe('paneTooSmall');
});

it('refuses a move while the server stops', () => {
  const state = run([attachLarge, createPhi, createTab, { type: 'stopServer' }]);

  expect(refusalOf(state, move(1, toTab(2)))).toBe('serverStopping');
});

it('does not bring the destination zoom back when a moved running pane closes', () => {
  const closeThird: Intent = { type: 'closePane', paneId: paneId(3) };
  const base = run([attachLarge, createPhi, splitFirst('right'), createTab, zoom(1)]);
  const running = fact(base, { type: 'paneStarted', paneId: paneId(3), generation: 3 }).state;
  const moved = intent(running, move(3, toTab(1))).state;
  const closed = intent(moved, closeThird).state;
  const destination = closed.tabs.find((tab) => tab.id === tabId(1));

  expect(destination?.zoomedPaneId).toBeUndefined();
  expect(destination?.focusedPaneId).toBe(paneId(1));
});

it('does not bring the destination zoom back when a moved running pane exits', () => {
  const base = run([attachLarge, createPhi, splitFirst('right'), createTab, zoom(1)]);
  const running = fact(base, { type: 'paneStarted', paneId: paneId(3), generation: 3 }).state;
  const moved = intent(running, move(3, toTab(1))).state;
  const exited = fact(moved, { type: 'paneExited', paneId: paneId(3), generation: 3, exitCode: 0 });

  expect(exited.state.panes.some((pane) => pane.id === paneId(3))).toBe(false);
  expect(exited.state.tabs.find((tab) => tab.id === tabId(1))?.zoomedPaneId).toBeUndefined();
});
