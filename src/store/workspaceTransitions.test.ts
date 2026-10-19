import { expect, it } from 'bun:test';

import { paneId, tabId, workspaceId } from '../ids.ts';
import { applyIntent, createState, focusedPane, snapshot } from './store.ts';
import type { Intent, Pane, Tab, WorkspaceRecord } from './store.ts';
import {
  createApi,
  createDocs,
  createKoja,
  fact,
  intent,
  run,
  unknownWorkspace,
} from './storeFixtures.ts';

it('creates a workspace with one tab and one starting pane', () => {
  const result = intent(createState(), createKoja);

  const pane: Pane = {
    id: paneId(1),
    tabId: tabId(1),
    lifecycle: 'starting',
    size: { columns: 80, rows: 24 },
    generation: 1,
    exitCode: undefined,
    startFolder: undefined,
    restored: false,
    error: undefined,
  };

  const tab: Tab = {
    id: tabId(1),
    workspaceId: workspaceId(1),
    layout: { kind: 'pane', paneId: paneId(1) },
    focusedPaneId: paneId(1),
    zoomedPaneId: undefined,
    label: undefined,
  };

  const workspace: WorkspaceRecord = {
    id: workspaceId(1),
    root: '/work/koja',
    label: 'koja',
    tabIds: [tabId(1)],
  };

  const view = {
    focusedWorkspaceId: workspaceId(1),
    activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(1) }],
    scrolls: [],
  };

  expect(snapshot(result.state)).toEqual({
    revision: 3,
    workspaces: [workspace],
    tabs: [tab],
    panes: [pane],
    defaultView: view,
    attachedClientId: undefined,
    foregroundClientId: undefined,
    clients: [],
  });

  expect(focusedPane(result.state)).toEqual(pane);

  expect(result.changes).toEqual([
    { type: 'workspaceAdded', workspace, activeTabId: tabId(1), focusedWorkspaceId: workspace.id },
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
  ]);
});

it('starts a pane at the layout size of the attached client', () => {
  const state = run([{ type: 'attachClient', size: { columns: 120, rows: 40 } }]);

  expect(intent(state, createKoja).state.panes[0]?.size).toEqual({
    columns: 100,
    rows: 39,
  });
});

it('adds a second workspace with its own tab and pane, and focuses it', () => {
  const state = run([createKoja, createDocs]);

  expect(state.workspaces.map((workspace) => workspace.id)).toEqual([
    workspaceId(1),
    workspaceId(2),
  ]);

  expect(state.workspaces.map((workspace) => workspace.root)).toEqual(['/work/koja', '/work/docs']);
  expect(state.workspaces.map((workspace) => workspace.label)).toEqual(['koja', 'docs']);
  expect(state.tabs.map((tab) => tab.id)).toEqual([tabId(1), tabId(2)]);
  expect(state.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);
  expect(state.panes.map((pane) => pane.generation)).toEqual([1, 2]);
  expect(state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('focuses a workspace', () => {
  const state = run([createKoja, createDocs]);
  const result = intent(state, { type: 'focusWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(result.changes).toEqual([{ type: 'workspaceFocused', workspaceId: workspaceId(1) }]);
  expect(focusedPane(result.state)?.id).toBe(paneId(1));
});

it('renames a workspace', () => {
  const state = run([createKoja, createDocs]);

  const result = intent(state, {
    type: 'renameWorkspace',
    workspaceId: workspaceId(1),
    label: 'main',
  });

  expect(result.state.workspaces.map((workspace) => workspace.label)).toEqual(['main', 'docs']);

  expect(result.changes).toEqual([
    { type: 'workspaceRenamed', workspaceId: workspaceId(1), label: 'main' },
  ]);
});

it('closes a workspace with its tab and pane', () => {
  const state = run([createKoja, createDocs]);
  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(2)]);
  expect(result.state.tabs.map((tab) => tab.id)).toEqual([tabId(2)]);
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(2)]);
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
  expect(result.state.revision).toBe(state.revision + result.changes.length);

  expect(result.changes).toEqual([
    { type: 'paneRemoved', paneId: paneId(1) },
    { type: 'tabRemoved', tabId: tabId(1) },
    { type: 'workspaceRemoved', workspaceId: workspaceId(1), focusedWorkspaceId: workspaceId(2) },
  ]);
});

it('refuses a workspace intent for an unknown workspace and leaves state unchanged', () => {
  const state = run([createKoja]);

  const intents: Intent[] = [
    { type: 'focusWorkspace', workspaceId: unknownWorkspace },
    { type: 'renameWorkspace', workspaceId: unknownWorkspace, label: 'x' },
    { type: 'closeWorkspace', workspaceId: unknownWorkspace },
  ];

  for (const next of intents) {
    expect(applyIntent(state, next)).toEqual({
      kind: 'rejected',
      state,
      reason: 'unknownWorkspace',
    });
  }
});

it('refuses a workspace intent while the server stops and leaves state unchanged', () => {
  const state = run([createKoja, { type: 'stopServer' }]);

  const intents: Intent[] = [
    { type: 'focusWorkspace', workspaceId: workspaceId(1) },
    { type: 'renameWorkspace', workspaceId: workspaceId(1), label: 'x' },
    { type: 'closeWorkspace', workspaceId: workspaceId(1) },
  ];

  for (const next of intents) {
    expect(applyIntent(state, next)).toEqual({ kind: 'rejected', state, reason: 'serverStopping' });
  }
});

it('focuses the next workspace when the focused middle one closes', () => {
  const state = run([
    createKoja,
    createDocs,
    createApi,
    { type: 'focusWorkspace', workspaceId: workspaceId(2) },
  ]);

  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(2) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(3));
});

it('focuses the previous workspace when the focused last one closes', () => {
  const state = run([createKoja, createDocs, createApi]);
  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(3) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('keeps the focus when an unfocused workspace closes', () => {
  const state = run([createKoja, createDocs]);
  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('keeps the earlier focus when a workspace is created without focus or a label', () => {
  const state = run([createKoja]);

  const result = intent(state, {
    type: 'createWorkspace',
    root: '/work/docs',
    label: undefined,
    focus: false,
  });

  const added = result.changes.find((change) => change.type === 'workspaceAdded');

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(added?.focusedWorkspaceId).toBe(workspaceId(1));
  expect(result.state.workspaces.map((workspace) => workspace.label)).toEqual(['koja', 'docs']);
});

it('focuses a workspace created without focus when no workspace is focused', () => {
  const result = intent(createState(), {
    type: 'createWorkspace',
    root: '/work/docs',
    label: 'docs',
    focus: false,
  });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
});

it('labels a workspace with the whole root when the root has no base name', () => {
  const result = intent(createState(), {
    type: 'createWorkspace',
    root: '/',
    label: undefined,
    focus: true,
  });

  expect(result.state.workspaces.map((workspace) => workspace.label)).toEqual(['/']);
});

it('keeps the workspace that was focused when the pane of a new workspace fails to start', () => {
  const state = run([
    createKoja,
    createDocs,
    { type: 'focusWorkspace', workspaceId: workspaceId(1) },
    { type: 'createWorkspace', root: '/work/api', label: 'api', focus: true },
  ]);

  const result = fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([
    workspaceId(1),
    workspaceId(2),
  ]);
});

it.each(['/work/koja/', '/work/koja//', '/work/koja'])(
  'labels a workspace by the last folder of %s',
  (root) => {
    const result = intent(createState(), {
      type: 'createWorkspace',
      root,
      label: undefined,
      focus: true,
    });

    expect(result.state.workspaces[0]?.label).toBe('koja');
  },
);

it('changes nothing when a workspace gets the label it has', () => {
  const state = run([createKoja]);

  const result = intent(state, {
    type: 'renameWorkspace',
    workspaceId: workspaceId(1),
    label: 'koja',
  });

  expect(result.changes).toEqual([]);
  expect(result.state.workspaces).toEqual(state.workspaces);
  expect(result.state.revision).toBe(state.revision);
});
