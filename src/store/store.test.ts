import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import {
  applyIntent,
  createState,
  focusedPane,
  paneTheme,
  savedSessionOf,
  shownFocusedPaneId,
  snapshot,
} from './store.ts';
import {
  attachedEmpty,
  createDocs,
  createKoja,
  createTab,
  intent,
  noReads,
  richSession,
  run,
  runLegacy,
  twoClients,
  unknownWorkspace,
  viewShowing,
  withViews,
} from './storeFixtures.ts';

it('raises the revision by one per change, and snapshots the last revision', () => {
  const started = intent(createState(), createKoja).state;

  const refused = applyIntent(started, {
    type: 'closeWorkspace',
    workspaceId: unknownWorkspace,
  }).state;

  const attached = intent(refused, { type: 'attachClient', size: { columns: 100, rows: 30 } });

  expect(started.revision).toBe(3);
  expect(refused.revision).toBe(3);
  expect(attached.changes).toHaveLength(2);
  expect(attached.state.revision).toBe(5);

  expect(snapshot(attached.state)).toEqual({
    revision: 5,
    workspaces: attached.state.workspaces,
    tabs: attached.state.tabs,
    panes: attached.state.panes,
    defaultView: attached.state.defaultView,
    attachedClientId: clientId(1),
    foregroundClientId: clientId(1),
    clients: attached.state.clients,
  });
});

it('saves the default view through the workspace fields and no client', () => {
  const state = twoClients(createKoja, createDocs);

  const moved = intent(state, {
    type: 'focusTab',
    tabId: tabId(1),
    clientId: clientId(1),
  }).state;

  const saved = savedSessionOf(moved, noReads);

  expect(saved.focusedWorkspaceId).toBe(workspaceId(1));
  expect(saved.workspaces.map((workspace) => workspace.activeTabId)).toEqual([tabId(1), tabId(2)]);
  expect(JSON.stringify(saved)).not.toContain('client');
});

it('saves a folder that was read, and keeps the restored folder for a pane with none read', () => {
  const saved = savedSessionOf(runLegacy(richSession), noReads);

  const withFolders = {
    ...saved,
    panes: saved.panes.map((pane) => ({
      id: pane.id,
      tabId: pane.tabId,
      startFolder: `/restored/${pane.id}`,
      pi: undefined,
    })),
  };

  const restored = intent(attachedEmpty(), { type: 'restoreSession', session: withFolders }).state;
  const read = new Map([[paneId(1), '/read/one']]);
  const next = savedSessionOf(restored, { ...noReads, folders: read });

  expect(next.panes.map((pane) => pane.startFolder)).toEqual([
    '/read/one',
    '/restored/pane-2',
    '/restored/pane-3',
    '/restored/pane-4',
  ]);

  expect(
    savedSessionOf(runLegacy(richSession), noReads).panes.map((pane) => pane.startFolder),
  ).toEqual([undefined, undefined, undefined, undefined]);
});

it('finds the focused pane of the tab the source client shows, or the default view shows', () => {
  const state = withViews(twoClients(createKoja, createTab), [
    viewShowing(1, [[1, 1]]),
    viewShowing(1, [[1, 2]]),
    viewShowing(1, [[1, 1]]),
  ]);

  expect(shownFocusedPaneId(state, workspaceId(1), clientId(1))).toBe(paneId(2));
  expect(shownFocusedPaneId(state, workspaceId(1), clientId(2))).toBe(paneId(1));
  expect(shownFocusedPaneId(state, workspaceId(1), undefined)).toBe(paneId(1));
});

it('finds no focused pane for an unknown workspace', () => {
  const state = run([createKoja]);

  expect(shownFocusedPaneId(state, unknownWorkspace, undefined)).toBeUndefined();
});

it('finds no focused pane in a state without workspaces', () => {
  expect(focusedPane(createState())).toBeUndefined();
});

it('finds no focused pane when the default view shows no tab', () => {
  const state = run([createKoja]);
  const lost = { ...state.defaultView, focusedWorkspaceId: unknownWorkspace };

  expect(focusedPane({ ...state, defaultView: lost })).toBeUndefined();
});

it('finds no pane colors without an attached client', () => {
  expect(paneTheme(createState())).toBeUndefined();
});
