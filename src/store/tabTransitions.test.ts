import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { activeTabOf, applyIntent, focusedPane } from './store.ts';
import type { Intent, Pane, State, Tab, WorkspaceRecord } from './store.ts';
import {
  attachLarge,
  createApi,
  createDocs,
  createPhi,
  createTab,
  defined,
  fact,
  intent,
  run,
  twoClients,
  unknownWorkspace,
} from './storeFixtures.ts';

const workspaceOne = (state: State): WorkspaceRecord => {
  const workspace = state.workspaces.find((known) => known.id === workspaceId(1));

  if (workspace === undefined) {
    throw new Error('Expected workspace-1.');
  }

  return workspace;
};

it('creates a second tab with a starting pane, last in the list and active', () => {
  const result = intent(run([createPhi]), createTab);

  const pane: Pane = {
    id: paneId(2),
    tabId: tabId(2),
    lifecycle: 'starting',
    size: { columns: 80, rows: 24 },
    generation: 2,
    exitCode: undefined,
    startFolder: undefined,
    restored: false,
    error: undefined,
  };

  const tab: Tab = {
    id: tabId(2),
    workspaceId: workspaceId(1),
    layout: { kind: 'pane', paneId: paneId(2) },
    focusedPaneId: paneId(2),
    zoomedPaneId: undefined,
    label: undefined,
  };

  expect(workspaceOne(result.state)).toMatchObject({ tabIds: [tabId(1), tabId(2)] });
  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(2));

  expect(result.changes).toEqual([
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
    { type: 'tabFocused', workspaceId: workspaceId(1), tabId: tabId(2) },
  ]);

  expect(focusedPane(result.state)).toEqual(pane);
});

it('focuses a tab and the workspace that owns it', () => {
  const state = run([createPhi, createTab, createDocs]);
  const result = intent(state, { type: 'focusTab', tabId: tabId(1) });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  expect(result.changes).toEqual([
    { type: 'tabFocused', workspaceId: workspaceId(1), tabId: tabId(1) },
    { type: 'workspaceFocused', workspaceId: workspaceId(1) },
  ]);
});

it('reports no change when the tab is already active and focused', () => {
  const state = run([createPhi, createTab]);
  const result = intent(state, { type: 'focusTab', tabId: tabId(2) });

  expect(result.changes).toEqual([]);
  expect(result.state).toEqual(state);
});

it('closes a tab with its pane and keeps the workspace', () => {
  const state = run([createPhi, createTab]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(1) });

  expect(result.state.tabs.map((tab) => tab.id)).toEqual([tabId(2)]);
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(2)]);
  expect(workspaceOne(result.state)).toMatchObject({ tabIds: [tabId(2)] });
  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(2));
});

it('removes the workspace when its only tab closes', () => {
  const result = intent(run([createPhi]), { type: 'closeTab', tabId: tabId(1) });

  expect(result.state.workspaces).toEqual([]);
  expect(result.state.defaultView.focusedWorkspaceId).toBeUndefined();
});

it('hands activity to the previous tab when the active middle tab closes', () => {
  const state = run([createPhi, createTab, createTab, { type: 'focusTab', tabId: tabId(2) }]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(2) });

  expect(workspaceOne(result.state)).toMatchObject({ tabIds: [tabId(1), tabId(3)] });
  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));

  expect(result.changes).toContainEqual({
    type: 'tabFocused',
    workspaceId: workspaceId(1),
    tabId: tabId(1),
  });
});

it('hands activity to the next tab when the active first tab closes', () => {
  const state = run([createPhi, createTab, createTab, { type: 'focusTab', tabId: tabId(1) }]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(1) });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(2));
});

it('keeps the active tab when an inactive tab closes before it', () => {
  const state = run([createPhi, createTab, createTab, { type: 'focusTab', tabId: tabId(3) }]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(1) });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(3));
  expect(result.changes.some((change) => change.type === 'tabFocused')).toBe(false);
});

it('hands activity to the previous tab when the active last tab closes', () => {
  const state = run([createPhi, createTab]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(2) });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));

  expect(result.changes).toContainEqual({
    type: 'tabFocused',
    workspaceId: workspaceId(1),
    tabId: tabId(1),
  });
});

it('keeps the active tab when another tab closes', () => {
  const state = run([createPhi, createTab]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(1) });

  expect(result.changes.some((change) => change.type === 'tabFocused')).toBe(false);
});

it('hands activity to a neighbor when the pane of the active tab exits', () => {
  const state = run([createPhi, createTab]);
  const result = fact(state, { type: 'paneExited', paneId: paneId(2), generation: 2, exitCode: 0 });

  expect(workspaceOne(result.state)).toMatchObject({ tabIds: [tabId(1)] });
  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));
});

it('refuses a tab intent for an unknown tab or workspace and leaves state unchanged', () => {
  const state = run([createPhi]);

  const unknownTabs: Intent[] = [
    { type: 'focusTab', tabId: tabId(99) },
    { type: 'closeTab', tabId: tabId(99) },
  ];

  for (const next of unknownTabs) {
    expect(applyIntent(state, next)).toEqual({ kind: 'rejected', state, reason: 'unknownTab' });
  }

  expect(
    applyIntent(state, {
      type: 'createTab',
      workspaceId: unknownWorkspace,
      folder: undefined,
      focus: true,
    }),
  ).toEqual({
    kind: 'rejected',
    state,
    reason: 'unknownWorkspace',
  });
});

it('refuses a tab intent while the server stops and leaves state unchanged', () => {
  const state = run([createPhi, { type: 'stopServer' }]);

  const intents: Intent[] = [
    createTab,
    { type: 'focusTab', tabId: tabId(1) },
    { type: 'closeTab', tabId: tabId(1) },
  ];

  for (const next of intents) {
    expect(applyIntent(state, next)).toEqual({ kind: 'rejected', state, reason: 'serverStopping' });
  }
});

it('keeps the tab that was active when the pane of a new tab fails to start', () => {
  const state = run([
    createPhi,
    { type: 'createTab', workspaceId: workspaceId(1), folder: undefined, focus: true },
    { type: 'focusTab', tabId: tabId(1) },
    { type: 'createTab', workspaceId: workspaceId(1), folder: undefined, focus: true },
  ]);

  const result = fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  const owner = result.state.workspaces[0];

  expect(owner?.tabIds).toEqual([tabId(1), tabId(2)]);
  expect(activeTabOf(result.state.defaultView, owner?.id)).toBe(tabId(1));
});

it('restores the focused workspace of every view when the pane of a focused new tab fails to start', () => {
  const state = twoClients(createPhi, createDocs);
  const created = intent(state, { ...createTab, focus: true }).state;
  const pane = created.panes.at(-1);

  expect(created.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  const result = fact(created, {
    type: 'paneFailedToStart',
    paneId: pane?.id ?? paneId(0),
    generation: pane?.generation ?? 0,
    message: 'no shell',
  });

  expect(result.state.defaultView).toEqual(state.defaultView);
  expect(result.state.clients).toEqual(state.clients);
});

it('leaves every view unchanged when createTab does not focus', () => {
  const state = twoClients(createPhi);
  const sources = [undefined, clientId(1)];

  for (const source of sources) {
    const result = intent(state, {
      ...createTab,
      focus: false,
      ...(source === undefined ? {} : { clientId: source }),
    });

    expect(result.state.workspaces[0]?.tabIds).toEqual([tabId(1), tabId(2)]);
    expect(result.state.defaultView).toEqual(state.defaultView);
    expect(result.state.clients).toEqual(state.clients);
    expect(result.changes.map((change) => change.type)).toEqual(['tabAdded', 'paneAdded']);
  }
});

it('records the folder of a createTab intent on the new pane', () => {
  const result = intent(run([createPhi]), { ...createTab, folder: '/srv/source' });

  expect(result.state.panes.find((pane) => pane.id === paneId(2))?.startFolder).toBe('/srv/source');
});

it('renames a tab and reports the change', () => {
  const state = run([createPhi]);
  const result = intent(state, { type: 'renameTab', tabId: tabId(1), label: 'build' });

  expect(result.state.tabs.map((tab) => tab.label)).toEqual(['build']);
  expect(result.changes).toEqual([{ type: 'tabRenamed', tabId: tabId(1), label: 'build' }]);
});

it('changes nothing when a tab gets the label it has', () => {
  const state = run([createPhi, { type: 'renameTab', tabId: tabId(1), label: 'build' }]);
  const result = intent(state, { type: 'renameTab', tabId: tabId(1), label: 'build' });

  expect(result.state).toEqual(state);
  expect(result.changes).toEqual([]);
});

it('refuses to rename an unknown tab and leaves state unchanged', () => {
  const state = run([createPhi]);

  expect(applyIntent(state, { type: 'renameTab', tabId: tabId(9), label: 'x' })).toEqual({
    kind: 'rejected',
    state,
    reason: 'unknownTab',
  });
});

it('refuses to rename a tab while the server stops and leaves state unchanged', () => {
  const state = run([createPhi, { type: 'stopServer' }]);

  expect(applyIntent(state, { type: 'renameTab', tabId: tabId(1), label: 'x' })).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

const failStart = (state: State, id: number): State =>
  fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(id),
    generation: state.panes.find((pane) => pane.id === paneId(id))?.generation ?? 0,
    message: 'no shell',
  }).state;

const closeWorkspaceOf = (id: number): Intent => ({
  type: 'closeWorkspace',
  workspaceId: workspaceId(id),
});

const focusWorkspaceOf = (id: number): Intent => ({
  type: 'focusWorkspace',
  workspaceId: workspaceId(id),
});

it('keeps the focused workspace of every view when its active tab closes', () => {
  const state = run([attachLarge, createPhi, createTab]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(2) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(result.state.clients[0]?.view.focusedWorkspaceId).toBe(workspaceId(1));
});

it('keeps the focused workspace when a new tab fails to start after the workspace it came from closed', () => {
  const state = run([createPhi, createDocs, createTab, closeWorkspaceOf(2)]);
  const result = failStart(state, 3);

  expect(result.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
});

it('keeps the workspace a view moved to when a new tab fails to start', () => {
  const state = run([
    createPhi,
    createDocs,
    createApi,
    focusWorkspaceOf(2),
    createTab,
    focusWorkspaceOf(3),
  ]);

  const result = failStart(state, 4);

  expect(result.defaultView.focusedWorkspaceId).toBe(workspaceId(3));
});

it('focuses the next workspace when the only tab of a new workspace fails after the earlier one closed', () => {
  const state = run([createPhi, createDocs, closeWorkspaceOf(1)]);
  const result = failStart(state, 2);

  expect(result.workspaces).toEqual([]);
  expect(result.defaultView.focusedWorkspaceId).toBeUndefined();
});

it('focuses the next workspace when the last tab of a workspace fails after its earlier tabs closed', () => {
  const state = run([
    createPhi,
    createDocs,
    focusWorkspaceOf(1),
    createTab,
    { type: 'closeTab', tabId: tabId(1) },
  ]);

  const result = failStart(state, 3);

  expect(result.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(2)]);
  expect(result.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('reports the client views that move when the last tab of a workspace closes', () => {
  const state = run([attachLarge, createPhi, createDocs]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(2) });
  const view = result.state.clients[0]?.view;

  expect(view?.focusedWorkspaceId).toBe(workspaceId(1));

  expect(result.changes).toContainEqual({
    type: 'clientViewChanged',
    clientId: clientId(1),
    view: defined(view),
  });
});

it('adds a new tab only to the workspace that owns it', () => {
  const state = run([createPhi, createDocs]);
  const result = intent(state, createTab);

  expect(result.state.workspaces.map((workspace) => workspace.tabIds)).toEqual([
    [tabId(1), tabId(3)],
    [tabId(2)],
  ]);
});

it('removes a closed tab only from the workspace that owns it', () => {
  const state = run([createPhi, createTab, createDocs]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(2) });

  expect(result.state.workspaces.map((workspace) => workspace.tabIds)).toEqual([
    [tabId(1)],
    [tabId(3)],
  ]);
});

it('focuses the workspace that owns the tab', () => {
  const state = run([createPhi, createDocs, focusWorkspaceOf(1)]);
  const result = intent(state, { type: 'focusTab', tabId: tabId(2) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('renames only the tab it names', () => {
  const state = run([createPhi, createTab]);
  const result = intent(state, { type: 'renameTab', tabId: tabId(2), label: 'logs' });

  expect(result.state.tabs.map((tab) => tab.label)).toEqual([undefined, 'logs']);
});

it('reports no tab focus change when a workspace closes with its active tab first', () => {
  const state = run([createPhi, createTab, createTab, { type: 'focusTab', tabId: tabId(1) }]);
  const result = intent(state, closeWorkspaceOf(1));

  expect(result.changes.map((change) => change.type)).not.toContain('tabFocused');
});
