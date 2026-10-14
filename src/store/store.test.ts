import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import {
  activeTabOf,
  applyFact,
  applyIntent,
  createState,
  focusedPane,
  paneTheme,
  savedSessionOf,
  snapshot,
} from './store.ts';
import type {
  Applied,
  Client,
  Fact,
  Ignored,
  Intent,
  Pane,
  Rejected,
  State,
  Tab,
  View,
  Theme,
  WorkspaceRecord,
} from './store.ts';

const expectApplied = (result: Applied | Ignored | Rejected): Applied => {
  if (result.kind !== 'applied') {
    throw new Error(`Expected an applied transition, got ${result.kind}.`);
  }

  return result;
};

const intent = (state: State, next: Intent): Applied => expectApplied(applyIntent(state, next));

const fact = (state: State, next: Fact): Applied => expectApplied(applyFact(state, next));

const run = (intents: readonly Intent[]): State =>
  intents.reduce((state, next) => intent(state, next).state, createState());

const firstPane = { paneId: paneId(1), generation: 1 };

const createPhi: Intent = {
  type: 'createWorkspace',
  root: '/work/phi',
  label: 'phi',
  background: false,
};

it('creates a workspace with one tab and one starting pane', () => {
  const result = intent(createState(), createPhi);

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
  };

  const workspace: WorkspaceRecord = {
    id: workspaceId(1),
    root: '/work/phi',
    label: 'phi',
    tabIds: [tabId(1)],
  };

  const view = {
    focusedWorkspaceId: workspaceId(1),
    activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(1) }],
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

  expect(intent(state, createPhi).state.panes[0]?.size).toEqual({
    columns: 100,
    rows: 39,
  });
});

const createDocs: Intent = {
  type: 'createWorkspace',
  root: '/work/docs',
  label: 'docs',
  background: false,
};

const createApi: Intent = {
  type: 'createWorkspace',
  root: '/work/api',
  label: 'api',
  background: false,
};

const unknownWorkspace = workspaceId(99);

it('adds a second workspace with its own tab and pane, and focuses it', () => {
  const state = run([createPhi, createDocs]);

  expect(state.workspaces.map((workspace) => workspace.id)).toEqual([
    workspaceId(1),
    workspaceId(2),
  ]);

  expect(state.workspaces.map((workspace) => workspace.root)).toEqual(['/work/phi', '/work/docs']);
  expect(state.workspaces.map((workspace) => workspace.label)).toEqual(['phi', 'docs']);
  expect(state.tabs.map((tab) => tab.id)).toEqual([tabId(1), tabId(2)]);
  expect(state.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);
  expect(state.panes.map((pane) => pane.generation)).toEqual([1, 2]);
  expect(state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('focuses a workspace', () => {
  const state = run([createPhi, createDocs]);
  const result = intent(state, { type: 'focusWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(result.changes).toEqual([{ type: 'workspaceFocused', workspaceId: workspaceId(1) }]);
  expect(focusedPane(result.state)?.id).toBe(paneId(1));
});

it('renames a workspace', () => {
  const state = run([createPhi, createDocs]);

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
  const state = run([createPhi, createDocs]);
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
  const state = run([createPhi]);

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
  const state = run([createPhi, { type: 'stopServer' }]);

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
    createPhi,
    createDocs,
    createApi,
    { type: 'focusWorkspace', workspaceId: workspaceId(2) },
  ]);

  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(2) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(3));
});

it('focuses the previous workspace when the focused last one closes', () => {
  const state = run([createPhi, createDocs, createApi]);
  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(3) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('keeps the focus when an unfocused workspace closes', () => {
  const state = run([createPhi, createDocs]);
  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('ignores the exit of a pane that a closed workspace removed, and names it for disposal', () => {
  const state = run([createPhi, { type: 'closeWorkspace', workspaceId: workspaceId(1) }]);
  const result = applyFact(state, { type: 'paneExited', ...firstPane, exitCode: 0 });

  expect(result).toEqual({ kind: 'ignored', state, dispose: firstPane });
});

it('refuses to start a pane while the server stops and leaves state unchanged', () => {
  const state = run([{ type: 'stopServer' }]);
  const result = applyIntent(state, createPhi);

  expect(result).toEqual({ kind: 'rejected', state, reason: 'serverStopping' });
  expect(result.state.revision).toBe(state.revision);
});

it('resizes the pane to the layout size of a client that attaches', () => {
  const state = run([createPhi]);
  const result = intent(state, { type: 'attachClient', size: { columns: 100, rows: 30 } });

  const client = {
    id: clientId(1),
    size: { columns: 100, rows: 30 },
    theme: undefined,
    view: state.defaultView,
  };

  expect(result.state.attachedClientId).toBe(clientId(1));
  expect(result.state.panes[0]?.size).toEqual({ columns: 80, rows: 29 });

  expect(result.changes).toEqual([
    { type: 'clientAttached', client },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 80, rows: 29 } },
  ]);
});

it('takes over from the attached client when a second client attaches', () => {
  const state = run([createPhi, { type: 'attachClient', size: { columns: 100, rows: 30 } }]);

  const result = intent(state, { type: 'attachClient', size: { columns: 90, rows: 20 } });

  const client = {
    id: clientId(2),
    size: { columns: 90, rows: 20 },
    theme: undefined,
    view: state.defaultView,
  };

  expect(result.state.attachedClientId).toBe(clientId(2));
  expect(result.state.clients).toEqual([client]);

  expect(result.changes).toEqual([
    { type: 'clientDetached', clientId: clientId(1), reason: 'takenOver' },
    { type: 'clientAttached', client },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 70, rows: 19 } },
  ]);
});

it('reports the client size and the pane size when the attached client resizes', () => {
  const state = run([createPhi, { type: 'attachClient', size: { columns: 100, rows: 30 } }]);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 60, rows: 15 },
  });

  expect(result.state.panes[0]?.size).toEqual({ columns: 40, rows: 14 });

  expect(result.changes).toEqual([
    { type: 'clientResized', clientId: clientId(1), size: { columns: 60, rows: 15 } },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 40, rows: 14 } },
  ]);
});

it('reports a client resize that keeps the pane size, and raises the revision', () => {
  const state = run([createPhi, { type: 'attachClient', size: { columns: 80, rows: 1 } }]);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 80, rows: 2 },
  });

  expect(result.state.panes[0]?.size).toEqual(state.panes[0]?.size);

  expect(result.changes).toEqual([
    { type: 'clientResized', clientId: clientId(1), size: { columns: 80, rows: 2 } },
  ]);

  expect(result.state.revision).toBe(state.revision + 1);
});

it('treats a client resize to its current size as no change', () => {
  const state = run([createPhi, { type: 'attachClient', size: { columns: 100, rows: 30 } }]);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 100, rows: 30 },
  });

  expect(result.changes).toEqual([]);
  expect(result.state.revision).toBe(state.revision);
});

it('refuses to resize an unknown client and leaves state unchanged', () => {
  const state = run([createPhi]);

  const result = applyIntent(state, {
    type: 'resizeClient',
    clientId: clientId(7),
    size: { columns: 60, rows: 15 },
  });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

it('detaches a client on request and keeps the pane size', () => {
  const state = run([createPhi, { type: 'attachClient', size: { columns: 100, rows: 30 } }]);

  const result = intent(state, { type: 'detachClient', clientId: clientId(1) });

  expect(result.state.attachedClientId).toBeUndefined();
  expect(result.state.clients).toEqual([]);
  expect(result.state.panes[0]?.size).toEqual({ columns: 80, rows: 29 });

  expect(result.changes).toEqual([
    { type: 'clientDetached', clientId: clientId(1), reason: 'requested' },
  ]);
});

it('refuses to detach an unknown client and leaves state unchanged', () => {
  const state = run([createPhi]);

  const result = applyIntent(state, { type: 'detachClient', clientId: clientId(7) });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

it('closes the pane and reports that the server should stop once', () => {
  const state = run([createPhi]);
  const stopped = intent(state, { type: 'stopServer' });

  expect(stopped.state.panes[0]?.lifecycle).toBe('closing');

  expect(stopped.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(1),
      lifecycle: 'closing',
      exitCode: undefined,
      error: undefined,
    },
    { type: 'serverStopping' },
  ]);

  expect(intent(stopped.state, { type: 'stopServer' }).changes).toEqual([]);
});

it('marks a started pane as running', () => {
  const state = run([createPhi]);
  const result = fact(state, { type: 'paneStarted', ...firstPane });

  expect(result.state.panes[0]?.lifecycle).toBe('running');

  expect(result.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(1),
      lifecycle: 'running',
      exitCode: undefined,
      error: undefined,
    },
  ]);
});

it('ignores a fact from an older generation and names the process to dispose', () => {
  const started = run([createPhi]);
  const pane = started.panes[0];

  expect(pane).toBeDefined();

  const state: State = { ...started, panes: pane ? [{ ...pane, generation: 2 }] : [] };
  const result = applyFact(state, { type: 'paneStarted', ...firstPane });

  expect(result).toEqual({ kind: 'ignored', state, dispose: firstPane } satisfies Ignored);
  expect(result.state.revision).toBe(state.revision);
});

it('ignores a pane that starts after the server began to stop, and names it for disposal', () => {
  const state = run([createPhi, { type: 'stopServer' }]);
  const result = applyFact(state, { type: 'paneStarted', ...firstPane });

  expect(result).toEqual({ kind: 'ignored', state, dispose: firstPane });
});

it('removes the pane, tab, and workspace of the only pane that exits, and keeps running', () => {
  const state = fact(run([createPhi]), { type: 'paneStarted', ...firstPane }).state;
  const result = fact(state, { type: 'paneExited', ...firstPane, exitCode: 3 });

  expect(result.state.panes).toEqual([]);
  expect(result.state.tabs).toEqual([]);
  expect(result.state.workspaces).toEqual([]);
  expect(result.state.defaultView.focusedWorkspaceId).toBeUndefined();
  expect(result.state.stopping).toBe(false);

  expect(result.changes).toEqual([
    { type: 'paneRemoved', paneId: paneId(1) },
    { type: 'tabRemoved', tabId: tabId(1) },
    { type: 'workspaceRemoved', workspaceId: workspaceId(1), focusedWorkspaceId: undefined },
  ]);
});

it('removes the workspace of a pane that fails to start, and keeps running', () => {
  const result = fact(run([createPhi]), {
    type: 'paneFailedToStart',
    ...firstPane,
    message: 'no shell',
  });

  expect(result.state.workspaces).toEqual([]);
  expect(result.state.panes).toEqual([]);
  expect(result.state.stopping).toBe(false);
  expect(result.changes.some((change) => change.type === 'serverStopping')).toBe(false);
});

it('keeps the other workspaces when one pane exits', () => {
  const state = run([createPhi, createDocs]);
  const result = fact(state, { type: 'paneExited', ...firstPane, exitCode: 0 });

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(2)]);
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('marks a closing pane exited without removing it while the server stops', () => {
  const state = run([createPhi, { type: 'stopServer' }]);
  const result = fact(state, { type: 'paneExited', ...firstPane, exitCode: 0 });

  expect(result.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(1),
      lifecycle: 'exited',
      exitCode: 0,
      error: undefined,
    },
  ]);
});

it('raises the revision by one per change, and snapshots the last revision', () => {
  const started = intent(createState(), createPhi).state;

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

const lightTheme: Theme = {
  foreground: 0x11_22_33,
  background: 0xdd_ee_ff,
  palette: Array.from({ length: 16 }, (_, index) => index),
};

const darkTheme: Theme = { ...lightTheme, background: 0x00_00_10 };

const attachedState = (): State => run([{ type: 'attachClient', size: { columns: 80, rows: 24 } }]);

it('has no pane colors until the attached client reports its theme', () => {
  expect(paneTheme(attachedState())).toBeUndefined();
});

it('uses the theme the attached client reports as the pane colors', () => {
  const result = intent(attachedState(), {
    type: 'setClientTheme',
    clientId: clientId(1),
    theme: lightTheme,
  });

  expect(paneTheme(result.state)).toEqual(lightTheme);

  expect(result.changes).toEqual([
    { type: 'clientThemeChanged', clientId: clientId(1), theme: lightTheme },
  ]);

  expect(result.state.revision).toBe(attachedState().revision + 1);
});

it('treats a theme equal to the client theme as no change', () => {
  const themed = intent(attachedState(), {
    type: 'setClientTheme',
    clientId: clientId(1),
    theme: lightTheme,
  }).state;

  const result = intent(themed, {
    type: 'setClientTheme',
    clientId: clientId(1),
    theme: { ...lightTheme, palette: [...lightTheme.palette] },
  });

  expect(result.changes).toEqual([]);
  expect(result.state).toEqual(themed);
});

it('changes the pane colors when a client with other colors takes over', () => {
  const themed = run([
    { type: 'attachClient', size: { columns: 80, rows: 24 } },
    { type: 'setClientTheme', clientId: clientId(1), theme: lightTheme },
    { type: 'attachClient', size: { columns: 80, rows: 24 } },
  ]);

  expect(paneTheme(themed)).toBeUndefined();

  const result = intent(themed, {
    type: 'setClientTheme',
    clientId: clientId(2),
    theme: darkTheme,
  });

  expect(paneTheme(result.state)).toEqual(darkTheme);

  expect(result.changes).toEqual([
    { type: 'clientThemeChanged', clientId: clientId(2), theme: darkTheme },
  ]);
});

it('refuses a theme from an unknown client and leaves state unchanged', () => {
  const state = attachedState();

  const result = applyIntent(state, {
    type: 'setClientTheme',
    clientId: clientId(9),
    theme: lightTheme,
  });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

it('keeps the earlier focus when a background workspace is created without a label', () => {
  const state = run([createPhi]);

  const result = intent(state, {
    type: 'createWorkspace',
    root: '/work/docs',
    label: undefined,
    background: true,
  });

  const added = result.changes.find((change) => change.type === 'workspaceAdded');

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(added?.focusedWorkspaceId).toBe(workspaceId(1));
  expect(result.state.workspaces.map((workspace) => workspace.label)).toEqual(['phi', 'docs']);
});

it('focuses a background workspace when no workspace is focused', () => {
  const result = intent(createState(), {
    type: 'createWorkspace',
    root: '/work/docs',
    label: 'docs',
    background: true,
  });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
});

it('labels a workspace with the whole root when the root has no base name', () => {
  const result = intent(createState(), {
    type: 'createWorkspace',
    root: '/',
    label: undefined,
    background: false,
  });

  expect(result.state.workspaces.map((workspace) => workspace.label)).toEqual(['/']);
});

const createTab: Intent = { type: 'createTab', workspaceId: workspaceId(1) };

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

  expect(applyIntent(state, { type: 'createTab', workspaceId: unknownWorkspace })).toEqual({
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
    { type: 'createTab', workspaceId: workspaceId(1) },
    { type: 'focusTab', tabId: tabId(1) },
    { type: 'createTab', workspaceId: workspaceId(1) },
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

it('keeps the workspace that was focused when the pane of a new workspace fails to start', () => {
  const state = run([
    createPhi,
    createDocs,
    { type: 'focusWorkspace', workspaceId: workspaceId(1) },
    { type: 'createWorkspace', root: '/work/api', label: 'api', background: false },
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

const attachLarge: Intent = { type: 'attachClient', size: { columns: 101, rows: 25 } };

const splitFirst = (direction: 'below' | 'right'): Intent => ({
  type: 'splitPane',
  paneId: paneId(1),
  direction,
});

const startedPane = (id: number, generation: number): Fact => ({
  type: 'paneStarted',
  paneId: paneId(id),
  generation,
});

it('splits a pane at half its area, starts the new pane, and focuses it', () => {
  const state = run([createPhi, attachLarge]);
  const result = intent(state, splitFirst('right'));
  const added = result.state.panes[1];

  expect(added).toEqual({
    id: paneId(2),
    tabId: tabId(1),
    lifecycle: 'starting',
    size: { columns: 38, rows: 22 },
    generation: 2,
    exitCode: undefined,
    startFolder: undefined,
    restored: false,
    error: undefined,
  });

  expect(result.state.panes[0]?.size).toEqual({ columns: 38, rows: 22 });
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));

  expect(result.state.tabs[0]?.layout).toEqual({
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: { kind: 'pane', paneId: paneId(1) },
    second: { kind: 'pane', paneId: paneId(2) },
  });

  expect(result.changes.map((change) => change.type)).toEqual([
    'paneAdded',
    'tabLayoutChanged',
    'paneFocused',
    'paneResized',
  ]);
});

it('splits the focused pane below and gives each pane half the rows', () => {
  const result = intent(run([createPhi, attachLarge]), splitFirst('below'));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 79, rows: 10 },
    { columns: 79, rows: 10 },
  ]);
});

it('splits a pane inside a split at half the area of that pane', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);

  const result = intent(state, { type: 'splitPane', paneId: paneId(2), direction: 'below' });

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 38, rows: 22 },
    { columns: 38, rows: 10 },
    { columns: 38, rows: 10 },
  ]);
});

it('gives the area and the focus of a closed pane to its sibling', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);
  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(result.state.tabs[0]?.layout).toEqual({ kind: 'pane', paneId: paneId(1) });
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(result.state.panes[0]?.size).toEqual({ columns: 81, rows: 24 });

  expect(result.changes.map((change) => change.type)).toEqual([
    'paneRemoved',
    'tabLayoutChanged',
    'paneFocused',
    'paneResized',
  ]);
});

it('focuses the first pane of a sibling split when its neighbor closes', () => {
  const state = run([
    createPhi,
    attachLarge,
    splitFirst('right'),
    { type: 'splitPane', paneId: paneId(2), direction: 'below' },
    { type: 'focusPane', paneId: paneId(1) },
  ]);

  const result = intent(state, { type: 'closePane', paneId: paneId(1) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 79, rows: 10 },
    { columns: 79, rows: 10 },
  ]);
});

it('keeps the focus when an unfocused pane closes', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);
  const result = intent(state, { type: 'closePane', paneId: paneId(1) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));
  expect(result.changes.some((change) => change.type === 'paneFocused')).toBe(false);
});

it('removes the tab and workspace when the last pane of a tab closes', () => {
  const result = intent(run([createPhi]), { type: 'closePane', paneId: paneId(1) });

  expect(result.state.tabs).toEqual([]);
  expect(result.state.workspaces).toEqual([]);
  expect(result.state.panes).toEqual([]);
});

it('focuses another pane of the tab', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);
  const result = intent(state, { type: 'focusPane', paneId: paneId(1) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.changes).toEqual([{ type: 'paneFocused', tabId: tabId(1), paneId: paneId(1) }]);
});

it('makes the tab of the focused pane active when that tab is inactive', () => {
  const state = run([createPhi, attachLarge, splitFirst('right'), createTab]);
  const result = intent(state, { type: 'focusPane', paneId: paneId(1) });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(focusedPane(result.state)?.id).toBe(paneId(1));

  expect(result.changes).toEqual([
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(1) },
    { type: 'tabFocused', workspaceId: workspaceId(1), tabId: tabId(1) },
    { type: 'clientViewChanged', clientId: clientId(1), view: result.state.defaultView },
  ]);
});

it('focuses the workspace of the focused pane when that workspace is unfocused', () => {
  const state = run([createPhi, createDocs]);
  const result = intent(state, { type: 'focusPane', paneId: paneId(1) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(focusedPane(result.state)?.id).toBe(paneId(1));
  expect(result.changes).toEqual([{ type: 'workspaceFocused', workspaceId: workspaceId(1) }]);
});

it('focuses the tab and workspace of a pane in an inactive tab of an unfocused workspace', () => {
  const state = run([createPhi, attachLarge, splitFirst('right'), createTab, createDocs]);

  const result = intent(state, { type: 'focusPane', paneId: paneId(1) });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(focusedPane(result.state)?.id).toBe(paneId(1));

  expect(result.changes).toEqual([
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(1) },
    { type: 'tabFocused', workspaceId: workspaceId(1), tabId: tabId(1) },
    { type: 'workspaceFocused', workspaceId: workspaceId(1) },
    { type: 'clientViewChanged', clientId: clientId(1), view: result.state.defaultView },
  ]);
});

it('resizes every live pane by the layout when the client resizes', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(1),
    size: { columns: 121, rows: 31 },
  });

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 48, rows: 28 },
    { columns: 48, rows: 28 },
  ]);

  expect(result.changes.filter((change) => change.type === 'paneResized')).toHaveLength(2);
});

it('closes only the pane that exits in a tab with two panes', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);

  const started = fact(state, startedPane(2, 2)).state;

  const result = fact(started, {
    type: 'paneExited',
    paneId: paneId(2),
    generation: 2,
    exitCode: 0,
  });

  expect(result.state.workspaces).toHaveLength(1);
  expect(result.state.tabs).toHaveLength(1);
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.state.tabs[0]?.layout).toEqual({ kind: 'pane', paneId: paneId(1) });
});

const tinyClient: Intent = { type: 'attachClient', size: { columns: 2, rows: 3 } };

it.each([
  [
    'split an unknown pane',
    { type: 'splitPane', paneId: paneId(9), direction: 'right' },
    'unknownPane',
  ],
  ['focus an unknown pane', { type: 'focusPane', paneId: paneId(9) }, 'unknownPane'],
  ['close an unknown pane', { type: 'closePane', paneId: paneId(9) }, 'unknownPane'],
  ['split a pane too narrow for two frames', splitFirst('right'), 'paneTooSmall'],
  ['split a pane too short for two frames', splitFirst('below'), 'paneTooSmall'],
] as const)('refuses to %s and leaves state unchanged', (_name, refused, reason) => {
  const state = run([createPhi, tinyClient]);

  expect(applyIntent(state, refused)).toEqual({ kind: 'rejected', state, reason });
});

it('splits a pane that has room for exactly two framed 1x1 terminals and a gap', () => {
  const state = run([createPhi, { type: 'attachClient', size: { columns: 7, rows: 7 } }]);
  const result = intent(state, splitFirst('right'));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 1, rows: 4 },
    { columns: 1, rows: 4 },
  ]);

  expect(
    applyIntent(result.state, { type: 'splitPane', paneId: paneId(2), direction: 'right' }),
  ).toMatchObject({ kind: 'rejected', reason: 'paneTooSmall' });
});

it('splits a pane by rows with no gap and refuses one row fewer', () => {
  const fits = run([createPhi, { type: 'attachClient', size: { columns: 3, rows: 7 } }]);
  const result = intent(fits, splitFirst('below'));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 1, rows: 1 },
    { columns: 1, rows: 1 },
  ]);

  const short = run([createPhi, { type: 'attachClient', size: { columns: 3, rows: 6 } }]);

  expect(applyIntent(short, splitFirst('below'))).toMatchObject({
    kind: 'rejected',
    reason: 'paneTooSmall',
  });
});

it('refuses a right split one column short of two frames and a gap', () => {
  const short = run([createPhi, { type: 'attachClient', size: { columns: 6, rows: 4 } }]);

  expect(applyIntent(short, splitFirst('right'))).toMatchObject({
    kind: 'rejected',
    reason: 'paneTooSmall',
  });
});

it.each([
  ['split', { type: 'splitPane', paneId: paneId(1), direction: 'right' }],
  ['focus', { type: 'focusPane', paneId: paneId(1) }],
  ['close', { type: 'closePane', paneId: paneId(1) }],
] as const)('refuses to %s a pane while the server stops', (_name, refused) => {
  const state = run([createPhi, { type: 'stopServer' }]);

  expect(applyIntent(state, refused)).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

it('gives the area of a closed pane to its sibling without an attached client', () => {
  const state = run([createPhi, splitFirst('right')]);
  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(result.state.panes[0]?.size).toEqual({ columns: 80, rows: 24 });

  expect(result.changes).toContainEqual({
    type: 'paneResized',
    paneId: paneId(1),
    size: { columns: 80, rows: 24 },
  });
});

it('gives the area of an exited pane to its sibling without an attached client', () => {
  const state = run([createPhi, splitFirst('right')]);
  const result = fact(state, { type: 'paneExited', paneId: paneId(2), generation: 2, exitCode: 0 });

  expect(result.state.panes[0]?.size).toEqual({ columns: 80, rows: 24 });

  expect(result.changes).toContainEqual({
    type: 'paneResized',
    paneId: paneId(1),
    size: { columns: 80, rows: 24 },
  });
});

it('splits by the area of the last client after it detaches', () => {
  const state = run([
    createPhi,
    { type: 'attachClient', size: { columns: 2, rows: 26 } },
    { type: 'detachClient', clientId: clientId(1) },
  ]);

  expect(applyIntent(state, splitFirst('right'))).toEqual({
    kind: 'rejected',
    state,
    reason: 'paneTooSmall',
  });
});

it('keeps the focus on an unfocused pane when its neighbor closes, and gives it the area', () => {
  const state = run([
    createPhi,
    attachLarge,
    splitFirst('right'),
    { type: 'splitPane', paneId: paneId(2), direction: 'below' },
    { type: 'focusPane', paneId: paneId(1) },
  ]);

  const result = intent(state, { type: 'closePane', paneId: paneId(3) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 38, rows: 22 },
    { columns: 38, rows: 22 },
  ]);
});

it('returns the focus to the earlier pane when a split pane fails to start', () => {
  const opened = run([createPhi, attachLarge, splitFirst('right')]);
  const state = fact(opened, startedPane(2, 2)).state;
  const split = intent(state, splitFirst('below'));

  expect(split.state.tabs[0]?.focusedPaneId).toBe(paneId(3));

  const result = fact(split.state, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);

  expect(result.changes).toContainEqual({
    type: 'paneFocused',
    tabId: tabId(1),
    paneId: paneId(2),
  });
});

it('gives the focus to the sibling when the focused pane of a split fails to start', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);

  const result = fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: 2,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
});

const sizes = (state: State): Map<PaneId, string> =>
  new Map(state.panes.map((pane) => [pane.id, `${pane.size.columns}x${pane.size.rows}`]));

const zoom = (id: number): Intent => ({ type: 'zoomPane', paneId: paneId(id) });

const resize = (
  id: number,
  direction: 'left' | 'right' | 'up' | 'down',
  cells: number,
): Intent => ({ type: 'resizePane', paneId: paneId(id), direction, cells });

const splitPaneOf = (id: number, direction: 'below' | 'right'): Intent => ({
  type: 'splitPane',
  paneId: paneId(id),
  direction,
});

it('zooms a pane over the whole area and keeps the size of the hidden pane', () => {
  const split = run([createPhi, attachLarge, splitFirst('right')]);
  const result = intent(split, zoom(1));

  expect(result.state.tabs[0]?.zoomedPaneId).toBe(paneId(1));
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.state.panes[0]?.size).toEqual({ columns: 81, rows: 24 });
  expect(result.state.panes[1]?.size).toEqual({ columns: 38, rows: 22 });

  expect(result.changes).toEqual([
    { type: 'tabZoomChanged', tabId: tabId(1), zoomedPaneId: paneId(1) },
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(1) },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 81, rows: 24 } },
  ]);

  const unzoomed = intent(result.state, zoom(1));

  expect(unzoomed.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(sizes(unzoomed.state)).toEqual(sizes(split));

  expect(unzoomed.changes).toEqual([
    { type: 'tabZoomChanged', tabId: tabId(1), zoomedPaneId: undefined },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 38, rows: 22 } },
  ]);
});

it('zooms and focuses a pane that is not focused', () => {
  const split = run([createPhi, attachLarge, splitFirst('right')]);
  const result = intent(split, zoom(1));

  expect(split.tabs[0]?.focusedPaneId).toBe(paneId(2));
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
});

it('does not zoom a tab with one pane', () => {
  const state = run([createPhi, attachLarge]);
  const result = intent(state, zoom(1));

  expect(result.changes).toEqual([]);
  expect(result.state.tabs).toEqual(state.tabs);
});

it('keeps the size of a hidden pane while the client resizes, and refits it on unzoom', () => {
  const zoomed = run([createPhi, attachLarge, splitFirst('right'), zoom(1)]);
  const client = zoomed.attachedClientId;

  if (client === undefined) {
    throw new Error('No client.');
  }

  const resized = intent(zoomed, {
    type: 'resizeClient',
    clientId: client,
    size: { columns: 61, rows: 25 },
  });

  expect(resized.state.panes[0]?.size).toEqual({ columns: 41, rows: 24 });
  expect(resized.state.panes[1]?.size).toEqual({ columns: 38, rows: 22 });
  expect(intent(resized.state, zoom(1)).state.panes[1]?.size).toEqual({ columns: 18, rows: 22 });
});

it('unzooms when the zoomed pane is split', () => {
  const state = run([createPhi, attachLarge, splitFirst('right'), zoom(1)]);
  const result = intent(state, splitPaneOf(1, 'below'));

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(3));
  expect(result.state.panes.every((pane) => pane.size.columns <= 38)).toBe(true);

  expect(result.changes).toContainEqual({
    type: 'tabZoomChanged',
    tabId: tabId(1),
    zoomedPaneId: undefined,
  });
});

it('restores the zoom and focus when a split pane of a zoomed tab fails to start', () => {
  const zoomed = run([createPhi, attachLarge, splitFirst('right'), zoom(1)]);
  const split = intent(zoomed, splitPaneOf(1, 'below'));

  const result = fact(split.state, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.zoomedPaneId).toBe(paneId(1));
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);
  expect(result.state.panes[0]?.size).toEqual({ columns: 81, rows: 24 });

  expect(result.changes).toContainEqual({
    type: 'tabZoomChanged',
    tabId: tabId(1),
    zoomedPaneId: paneId(1),
  });
});

it('does not report a zoom change when a failed split leaves the zoom as it was', () => {
  const split = run([createPhi, attachLarge, splitFirst('right')]);

  const result = fact(split, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: 2,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(result.changes.some((change) => change.type === 'tabZoomChanged')).toBe(false);
});

it('unzooms when a started split pane closes', () => {
  const opened = run([createPhi, attachLarge, splitFirst('right')]);
  const started = fact(opened, startedPane(2, 2)).state;
  const zoomed = intent(started, zoom(1)).state;
  const split = intent(zoomed, splitPaneOf(1, 'below')).state;
  const running = fact(split, startedPane(3, 3)).state;
  const result = intent(running, { type: 'closePane', paneId: paneId(3) });

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
});

it('leaves the tab unzoomed when the focus moved before a split pane failed to start', () => {
  const zoomed = run([createPhi, attachLarge, splitFirst('right'), zoom(1)]);
  const split = intent(zoomed, splitPaneOf(1, 'below')).state;
  const refocused = intent(split, { type: 'focusPane', paneId: paneId(2) }).state;

  const result = fact(refocused, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));
});

it('unzooms when a pane closes', () => {
  const state = run([createPhi, attachLarge, splitFirst('right'), zoom(1)]);
  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(result.state.panes.map((pane) => pane.size)).toEqual([{ columns: 81, rows: 24 }]);

  expect(result.changes).toContainEqual({
    type: 'tabZoomChanged',
    tabId: tabId(1),
    zoomedPaneId: undefined,
  });
});

it('unzooms when another pane takes the focus, but not when the zoomed pane does', () => {
  const state = run([createPhi, attachLarge, splitFirst('right'), zoom(1)]);
  const same = intent(state, { type: 'focusPane', paneId: paneId(1) });
  const other = intent(state, { type: 'focusPane', paneId: paneId(2) });

  expect(same.state.tabs[0]?.zoomedPaneId).toBe(paneId(1));
  expect(same.changes).toEqual([]);
  expect(other.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(other.state.tabs[0]?.focusedPaneId).toBe(paneId(2));
  expect(sizes(other.state)).toEqual(sizes(run([createPhi, attachLarge, splitFirst('right')])));

  expect(other.changes).toEqual([
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(2) },
    { type: 'tabZoomChanged', tabId: tabId(1), zoomedPaneId: undefined },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 38, rows: 22 } },
  ]);
});

const nestedState = (): State =>
  run([createPhi, attachLarge, splitFirst('right'), splitPaneOf(1, 'below')]);

it('resizes the panes of a nested layout by whole cells in each direction', () => {
  const state = nestedState();

  expect(sizes(state)).toEqual(
    new Map([
      [paneId(1), '38x10'],
      [paneId(2), '38x22'],
      [paneId(3), '38x10'],
    ]),
  );

  const right = intent(state, resize(1, 'right', 3)).state;
  const left = intent(state, resize(2, 'left', 2)).state;
  const down = intent(state, resize(1, 'down', 2)).state;
  const up = intent(state, resize(3, 'up', 1)).state;

  expect(sizes(right).get(paneId(1))).toBe('41x10');
  expect(sizes(right).get(paneId(2))).toBe('35x22');
  expect(sizes(left).get(paneId(1))).toBe('36x10');
  expect(sizes(left).get(paneId(2))).toBe('40x22');
  expect(sizes(down).get(paneId(1))).toBe('38x12');
  expect(sizes(down).get(paneId(3))).toBe('38x8');
  expect(sizes(up).get(paneId(1))).toBe('38x9');
  expect(sizes(up).get(paneId(3))).toBe('38x11');
});

it('reports the new layout and the resized panes of a resize', () => {
  const result = intent(nestedState(), resize(1, 'right', 1));

  expect(result.changes.map((change) => change.type)).toEqual([
    'tabLayoutChanged',
    'paneResized',
    'paneResized',
    'paneResized',
  ]);
});

it('unzooms a zoomed tab before it resizes', () => {
  const state = run([createPhi, attachLarge, splitFirst('right'), zoom(1)]);
  const result = intent(state, resize(1, 'right', 2));

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();

  expect(sizes(result.state)).toEqual(
    new Map([
      [paneId(1), '40x22'],
      [paneId(2), '36x22'],
    ]),
  );
});

it('clamps a resize at a framed 1x1 terminal and applies no changes when nothing moves', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);
  const shrunk = intent(state, resize(1, 'left', 500));

  expect(sizes(shrunk.state).get(paneId(1))).toBe('1x22');
  expect(sizes(shrunk.state).get(paneId(2))).toBe('75x22');

  const stuck = intent(shrunk.state, resize(1, 'left', 1));

  expect(stuck.changes).toEqual([]);
  expect(stuck.state.tabs).toEqual(shrunk.state.tabs);
  expect(sizes(intent(state, resize(1, 'right', 500)).state).get(paneId(2))).toBe('1x22');
});

it('applies no changes when a nested resize is stopped at the minimum', () => {
  const shrunk = intent(nestedState(), resize(1, 'up', 500));
  const stuck = intent(shrunk.state, resize(1, 'up', 1));

  expect(stuck.changes).toEqual([]);
  expect(stuck.state.tabs).toEqual(shrunk.state.tabs);
  expect(stuck.state.revision).toBe(shrunk.state.revision);
});

it('rejects a resize with no split on that axis and changes nothing', () => {
  const lone = run([createPhi, attachLarge]);
  const sideBySide = run([createPhi, attachLarge, splitFirst('right'), zoom(1)]);

  expect(applyIntent(lone, resize(1, 'left', 1))).toEqual({
    kind: 'rejected',
    state: lone,
    reason: 'noSplit',
  });

  expect(applyIntent(sideBySide, resize(1, 'up', 1))).toEqual({
    kind: 'rejected',
    state: sideBySide,
    reason: 'noSplit',
  });
});

it.each([
  ['zoom', zoom(9)],
  ['resize', resize(9, 'left', 1)],
] as const)('rejects a %s of an unknown pane', (_name, refused) => {
  const state = run([createPhi]);

  expect(applyIntent(state, refused)).toEqual({ kind: 'rejected', state, reason: 'unknownPane' });
});

it.each([
  ['zoom', zoom(1)],
  ['resize', resize(1, 'left', 1)],
] as const)('refuses to %s a pane while the server stops', (_name, refused) => {
  const state = run([createPhi, splitFirst('right'), { type: 'stopServer' }]);

  expect(applyIntent(state, refused)).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

const richSession: readonly Intent[] = [
  attachLarge,
  createPhi,
  createDocs,
  createTab,
  splitFirst('right'),
  zoom(4),
  { type: 'renameWorkspace', workspaceId: workspaceId(2), label: 'manual' },
  { type: 'focusWorkspace', workspaceId: workspaceId(1) },
];

const noFolders: ReadonlyMap<PaneId, string> = new Map();

const restoreIntent = (state: State): Intent => ({
  type: 'restoreSession',
  session: savedSessionOf(state, noFolders),
});

const attachedEmpty = (): State => intent(createState(), attachLarge).state;

it('restores a saved session with its ids, focus, and zoom', () => {
  const saved = run(richSession);
  const result = intent(attachedEmpty(), restoreIntent(saved));

  expect(savedSessionOf(result.state, noFolders)).toEqual(savedSessionOf(saved, noFolders));
  expect(result.state.panes).toHaveLength(4);
  expect(result.state.panes.every((pane) => pane.lifecycle === 'starting')).toBe(true);
  expect(result.state.tabs.some((tab) => tab.zoomedPaneId === paneId(4))).toBe(true);
});

it('adds one paneAdded change per restored pane', () => {
  const result = intent(attachedEmpty(), restoreIntent(run(richSession)));

  const added = result.changes.flatMap((change) =>
    change.type === 'paneAdded' ? [change.pane] : [],
  );

  expect(added).toEqual([...result.state.panes]);
  expect(result.state.revision).toBe(1 + result.changes.length);
  expect(new Set(added.map((pane) => pane.generation)).size).toBe(4);
});

it('refuses to restore into a state that has a workspace', () => {
  const state = run([createPhi]);

  expect(applyIntent(state, restoreIntent(run(richSession)))).toEqual({
    kind: 'rejected',
    state,
    reason: 'sessionNotEmpty',
  });
});

it('refuses to restore while the server stops', () => {
  const state = run([{ type: 'stopServer' }]);

  expect(applyIntent(state, restoreIntent(run(richSession)))).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

it('gives ids above the restored ones to a workspace created after a restore', () => {
  const restored = intent(createState(), restoreIntent(run(richSession))).state;
  const result = intent(restored, createApi);

  const added = result.changes.flatMap((change) =>
    change.type === 'paneAdded' ? [change.pane] : [],
  );

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([
    workspaceId(1),
    workspaceId(2),
    workspaceId(3),
  ]);

  expect(added.map((pane) => pane.id)).toEqual([paneId(5)]);
  expect(added.map((pane) => pane.tabId)).toEqual([tabId(4)]);
});

const failRestoredSecondPane = () => {
  const restored = intent(createState(), restoreIntent(run([createPhi, createDocs]))).state;
  const [, second] = restored.panes;

  const result = fact(restored, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: second?.generation ?? 0,
    message: 'Cannot start /bin/missing',
  });

  return { restored, result };
};

it('keeps a restored pane that fails to start, with its error', () => {
  const { restored, result } = failRestoredSecondPane();
  const failed = result.state.panes.find((pane) => pane.id === paneId(2));

  expect(failed?.lifecycle).toBe('failed');
  expect(failed?.error).toBe('Cannot start /bin/missing');
  expect(result.state.workspaces).toEqual(restored.workspaces);
  expect(result.state.tabs).toEqual(restored.tabs);

  expect(result.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(2),
      lifecycle: 'failed',
      exitCode: undefined,
      error: 'Cannot start /bin/missing',
    },
  ]);
});

it('closes a new pane that fails to start through the usual cascade', () => {
  const state = run([createPhi, createDocs]);
  const second = state.panes[1];

  const result = fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: second?.generation ?? 0,
    message: 'Cannot start /bin/missing',
  });

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(1)]);
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(result.changes.map((change) => change.type)).toContain('workspaceRemoved');
});

const viewOf = (state: State, id: number) =>
  state.clients.find((client) => client.id === clientId(id))?.view;

const focusedIn = (state: State, id: number) => viewOf(state, id)?.focusedWorkspaceId;

const activeIn = (state: State, id: number, workspace: number) => {
  const view = viewOf(state, id);

  return view === undefined ? undefined : activeTabOf(view, workspaceId(workspace));
};

// The store attaches one client at a time, so a second client joins by hand.
const withClient = (state: State, id: number): State => {
  const client: Client = {
    id: clientId(id),
    size: { columns: 80, rows: 24 },
    theme: undefined,
    view: state.defaultView,
  };

  const clientActivity = new Map(state.clientActivity).set(client.id, state.nextActivity);

  return {
    ...state,
    clients: [...state.clients, client],
    clientActivity,
    nextActivity: state.nextActivity + 1,
    nextClientNumber: id + 1,
  };
};

const twoClients = (...intents: readonly Intent[]): State =>
  withClient(run([...intents, attachLarge]), 2);

it('shows the workspace a CLI focus chose when no client is attached, after a reattach', () => {
  const attached = run([attachLarge, createPhi, createDocs]);
  const detached = intent(attached, { type: 'detachClient', clientId: clientId(1) }).state;

  const focus = intent(detached, { type: 'focusWorkspace', workspaceId: workspaceId(1) });
  const reattached = intent(focus.state, attachLarge).state;

  expect(focus.changes).toEqual([{ type: 'workspaceFocused', workspaceId: workspaceId(1) }]);
  expect(reattached.clients[0]?.view.focusedWorkspaceId).toBe(workspaceId(1));
  expect(savedSessionOf(reattached, noFolders).focusedWorkspaceId).toBe(workspaceId(1));
});

it('starts a new client from the default view', () => {
  const state = run([
    createPhi,
    createDocs,
    { type: 'focusWorkspace', workspaceId: workspaceId(1) },
  ]);

  const result = intent(state, attachLarge);

  expect(result.state.clients[0]?.view).toEqual(state.defaultView);
  expect(result.state.clients[0]?.view.focusedWorkspaceId).toBe(workspaceId(1));
});

it('moves the view of a terminal client and the default view, not that of another client', () => {
  const state = twoClients(createPhi, createDocs);

  const result = intent(state, {
    type: 'focusWorkspace',
    workspaceId: workspaceId(1),
    clientId: clientId(1),
  });

  expect(focusedIn(result.state, 1)).toBe(workspaceId(1));
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(focusedIn(result.state, 2)).toBe(workspaceId(2));

  expect(result.changes).toEqual([
    { type: 'workspaceFocused', workspaceId: workspaceId(1) },
    { type: 'clientViewChanged', clientId: clientId(1), view: result.state.defaultView },
  ]);
});

it('moves every view and the default view for a CLI focus', () => {
  const state = twoClients(createPhi, createDocs);
  const result = intent(state, { type: 'focusWorkspace', workspaceId: workspaceId(1) });

  expect(focusedIn(result.state, 1)).toBe(workspaceId(1));
  expect(focusedIn(result.state, 2)).toBe(workspaceId(1));
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  expect(result.changes.map((change) => change.type)).toEqual([
    'workspaceFocused',
    'clientViewChanged',
    'clientViewChanged',
  ]);
});

it('moves the active tab of a terminal client alone, and that of every view for the CLI', () => {
  const state = twoClients(createPhi, createTab);

  const terminal = intent(state, { type: 'focusTab', tabId: tabId(1), clientId: clientId(1) });

  expect(activeIn(terminal.state, 1, 1)).toBe(tabId(1));
  expect(activeTabOf(terminal.state.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(activeIn(terminal.state, 2, 1)).toBe(tabId(2));

  const cli = intent(terminal.state, { type: 'focusTab', tabId: tabId(2) });

  expect(activeIn(cli.state, 1, 1)).toBe(tabId(2));
  expect(activeIn(cli.state, 2, 1)).toBe(tabId(2));
  expect(activeTabOf(cli.state.defaultView, workspaceId(1))).toBe(tabId(2));
});

it('moves views by pane focus the way workspace focus does, and shares the pane focus', () => {
  const state = twoClients(createPhi, createDocs);

  const terminal = intent(state, {
    type: 'focusPane',
    paneId: paneId(1),
    clientId: clientId(1),
  });

  expect(focusedIn(terminal.state, 1)).toBe(workspaceId(1));
  expect(focusedIn(terminal.state, 2)).toBe(workspaceId(2));

  const cli = intent(terminal.state, { type: 'focusPane', paneId: paneId(2) });

  expect(focusedIn(cli.state, 1)).toBe(workspaceId(2));
  expect(focusedIn(cli.state, 2)).toBe(workspaceId(2));
  expect(cli.state.tabs.map((tab) => tab.focusedPaneId)).toEqual([paneId(1), paneId(2)]);
});

it('moves the view of a terminal client alone when it creates a workspace or a tab', () => {
  const state = twoClients(createPhi);

  const workspace = intent(state, { ...createDocs, clientId: clientId(1) });

  expect(focusedIn(workspace.state, 1)).toBe(workspaceId(2));
  expect(workspace.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
  expect(focusedIn(workspace.state, 2)).toBe(workspaceId(1));
  expect(activeIn(workspace.state, 2, 2)).toBe(tabId(2));

  const tab = intent(workspace.state, { ...createTab, clientId: clientId(2) });

  expect(activeIn(tab.state, 2, 1)).toBe(tabId(3));
  expect(activeIn(tab.state, 1, 1)).toBe(tabId(1));
  expect(activeTabOf(tab.state.defaultView, workspaceId(1))).toBe(tabId(3));
});

it('moves every view when the CLI creates a workspace or a tab', () => {
  const state = twoClients(createPhi);
  const workspace = intent(state, createDocs);

  expect(focusedIn(workspace.state, 1)).toBe(workspaceId(2));
  expect(focusedIn(workspace.state, 2)).toBe(workspaceId(2));

  const tab = intent(workspace.state, { type: 'createTab', workspaceId: workspaceId(2) });

  expect(activeIn(tab.state, 1, 2)).toBe(tabId(3));
  expect(activeIn(tab.state, 2, 2)).toBe(tabId(3));
});

it('keeps every view on its focus when a background workspace is created', () => {
  const state = twoClients(createPhi);
  const result = intent(state, { ...createDocs, background: true });

  expect(focusedIn(result.state, 1)).toBe(workspaceId(1));
  expect(focusedIn(result.state, 2)).toBe(workspaceId(1));
  expect(activeIn(result.state, 2, 2)).toBe(tabId(2));
});

it('refuses a focus from an unknown client and changes nothing', () => {
  const state = run([createPhi, createDocs]);

  const result = applyIntent(state, {
    type: 'focusWorkspace',
    workspaceId: workspaceId(1),
    clientId: clientId(7),
  });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

it('leaves the default view as it is when a client detaches or is taken over', () => {
  const state = run([createPhi, createDocs, attachLarge]);

  const moved = intent(state, {
    type: 'focusWorkspace',
    workspaceId: workspaceId(1),
    clientId: clientId(1),
  }).state;

  const detached = intent(moved, { type: 'detachClient', clientId: clientId(1) }).state;
  const takenOver = intent(moved, attachLarge).state;

  expect(detached.defaultView).toEqual(moved.defaultView);
  expect(detached.clients).toEqual([]);
  expect(takenOver.defaultView).toEqual(moved.defaultView);
  expect(takenOver.clients.map((client) => client.id)).toEqual([clientId(2)]);
  expect(takenOver.clients[0]?.view).toEqual(moved.defaultView);
});

it('moves every view that showed a closed tab to the default view tab, and keeps the others', () => {
  const base = twoClients(createPhi, createTab, createTab);

  const shown = intent(base, {
    type: 'focusTab',
    tabId: tabId(2),
    clientId: clientId(1),
  }).state;

  const result = intent(shown, { type: 'closeTab', tabId: tabId(2) });

  expect(activeIn(result.state, 1, 1)).toBe(tabId(1));
  expect(activeIn(result.state, 2, 1)).toBe(tabId(3));
  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));

  const moved = result.changes.flatMap((change) =>
    change.type === 'clientViewChanged' ? [change.clientId] : [],
  );

  expect(moved).toEqual([clientId(1)]);
});

it('gives a view on the closed tab the default tab, not a neighbor of the closed tab', () => {
  const base = twoClients(createPhi, createTab, createTab, createTab);

  const first = intent(base, {
    type: 'focusTab',
    tabId: tabId(3),
    clientId: clientId(1),
  }).state;

  const shown = intent(first, {
    type: 'focusTab',
    tabId: tabId(1),
    clientId: clientId(2),
  }).state;

  const result = intent(shown, { type: 'closeTab', tabId: tabId(3) });

  expect(activeTabOf(shown.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(activeIn(shown, 1, 1)).toBe(tabId(3));
  expect(activeIn(result.state, 1, 1)).toBe(tabId(1));
  expect(activeIn(result.state, 2, 1)).toBe(tabId(1));
});

it('keeps the tab a view remembers when another tab closes', () => {
  const base = twoClients(createPhi, createTab);

  const shown = intent(base, {
    type: 'focusTab',
    tabId: tabId(1),
    clientId: clientId(1),
  }).state;

  const result = intent(shown, { type: 'closeTab', tabId: tabId(2) });

  expect(activeIn(result.state, 1, 1)).toBe(tabId(1));
  expect(activeIn(result.state, 2, 1)).toBe(tabId(1));
});

it('moves every view off a closed workspace and drops its tabs from the views', () => {
  const state = twoClients(createPhi, createDocs);

  const shown = intent(state, {
    type: 'focusWorkspace',
    workspaceId: workspaceId(1),
    clientId: clientId(1),
  }).state;

  const result = intent(shown, { type: 'closeWorkspace', workspaceId: workspaceId(2) });

  expect(focusedIn(result.state, 1)).toBe(workspaceId(1));
  expect(focusedIn(result.state, 2)).toBe(workspaceId(1));
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  expect(viewOf(result.state, 2)?.activeTabs).toEqual([
    { workspaceId: workspaceId(1), tabId: tabId(1) },
  ]);

  expect(result.changes.filter((change) => change.type === 'clientViewChanged')).toHaveLength(2);
});

it('moves every view off a workspace whose only pane exits', () => {
  const state = twoClients(createPhi, createDocs);
  const second = state.panes[1];

  const result = fact(state, {
    type: 'paneExited',
    paneId: paneId(2),
    generation: second?.generation ?? 0,
    exitCode: 0,
  });

  expect(focusedIn(result.state, 1)).toBe(workspaceId(1));
  expect(focusedIn(result.state, 2)).toBe(workspaceId(1));
});

it('makes a client that attaches the foreground client', () => {
  const first = run([attachLarge]);

  expect(first.foregroundClientId).toBe(clientId(1));

  const second = intent(first, attachLarge);

  expect(second.state.foregroundClientId).toBe(clientId(2));
  expect(second.changes.map((change) => change.type)).not.toContain('foregroundChanged');
});

it('makes a client that sends input or a request the foreground client', () => {
  const state = withClient(run([attachLarge]), 2);

  expect(state.foregroundClientId).toBe(clientId(1));

  const result = intent(state, { type: 'markClientActive', clientId: clientId(2) });

  expect(result.state.foregroundClientId).toBe(clientId(2));
  expect(result.changes).toEqual([{ type: 'foregroundChanged', clientId: clientId(2) }]);

  const again = intent(result.state, { type: 'markClientActive', clientId: clientId(2) });

  expect(again.changes).toEqual([]);
});

it('makes a client that resizes the foreground client, even at the same size', () => {
  const state = withClient(run([attachLarge]), 2);

  const result = intent(state, {
    type: 'resizeClient',
    clientId: clientId(2),
    size: { columns: 80, rows: 24 },
  });

  expect(result.state.foregroundClientId).toBe(clientId(2));
  expect(result.changes).toEqual([{ type: 'foregroundChanged', clientId: clientId(2) }]);
});

it('gives the foreground to the client with the latest activity when the foreground leaves', () => {
  const crowded = withClient(withClient(run([attachLarge]), 2), 3);
  const second = intent(crowded, { type: 'markClientActive', clientId: clientId(2) }).state;
  const third = intent(second, { type: 'markClientActive', clientId: clientId(3) }).state;
  const first = intent(third, { type: 'markClientActive', clientId: clientId(1) }).state;

  const left = intent(first, { type: 'detachClient', clientId: clientId(1) });

  expect(left.state.foregroundClientId).toBe(clientId(3));

  expect(left.changes).toEqual([
    { type: 'clientDetached', clientId: clientId(1), reason: 'requested' },
    { type: 'foregroundChanged', clientId: clientId(3) },
  ]);

  const other = intent(first, { type: 'detachClient', clientId: clientId(2) });

  expect(other.state.foregroundClientId).toBe(clientId(1));
  expect(other.changes.map((change) => change.type)).toEqual(['clientDetached']);
});

it('leaves no foreground client when the last client detaches', () => {
  const result = intent(run([attachLarge]), { type: 'detachClient', clientId: clientId(1) });

  expect(result.state.foregroundClientId).toBeUndefined();
  expect(result.changes.map((change) => change.type)).toEqual(['clientDetached']);
});

it('refuses activity from an unknown client and changes nothing', () => {
  const state = run([attachLarge]);

  const result = applyIntent(state, { type: 'markClientActive', clientId: clientId(7) });

  expect(result).toEqual({ kind: 'rejected', state, reason: 'unknownClient' });
});

it('saves the default view through the workspace fields and no client', () => {
  const state = twoClients(createPhi, createDocs);

  const moved = intent(state, {
    type: 'focusTab',
    tabId: tabId(1),
    clientId: clientId(1),
  }).state;

  const saved = savedSessionOf(moved, noFolders);

  expect(saved.focusedWorkspaceId).toBe(workspaceId(1));
  expect(saved.workspaces.map((workspace) => workspace.activeTabId)).toEqual([tabId(1), tabId(2)]);
  expect(JSON.stringify(saved)).not.toContain('client');
});

const viewShowing = (workspace: number, tabs: readonly [number, number][]): View => ({
  focusedWorkspaceId: workspaceId(workspace),
  activeTabs: tabs.map(([owner, tab]) => ({ workspaceId: workspaceId(owner), tabId: tabId(tab) })),
});

// Replaces the default view and the views of clients 1 and 2.
const withViews = (state: State, views: readonly [View, View, View]): State => {
  const [defaultView, first, second] = views;

  return {
    ...state,
    defaultView,
    clients: state.clients.map((client, index) => ({
      ...client,
      view: index === 0 ? first : second,
    })),
  };
};

const workspaceTabs = twoClients(createPhi, createTab, createDocs);

it('focuses the default tab of the workspace in every view for a CLI focus', () => {
  const state = withViews(workspaceTabs, [
    viewShowing(2, [
      [1, 1],
      [2, 3],
    ]),
    viewShowing(1, [
      [1, 2],
      [2, 3],
    ]),
    viewShowing(2, [
      [1, 2],
      [2, 3],
    ]),
  ]);

  const result = intent(state, { type: 'focusWorkspace', workspaceId: workspaceId(1) });

  const expected = viewShowing(1, [
    [1, 1],
    [2, 3],
  ]);

  expect(result.state.defaultView).toEqual(expected);
  expect(viewOf(result.state, 1)).toEqual(expected);
  expect(viewOf(result.state, 2)).toEqual(expected);
});

it('focuses the tab the client remembers for a terminal focus and leaves other clients', () => {
  const state = withViews(workspaceTabs, [
    viewShowing(2, [
      [1, 1],
      [2, 3],
    ]),
    viewShowing(2, [
      [1, 2],
      [2, 3],
    ]),
    viewShowing(2, [
      [1, 1],
      [2, 3],
    ]),
  ]);

  const result = intent(state, {
    type: 'focusWorkspace',
    workspaceId: workspaceId(1),
    clientId: clientId(1),
  });

  const expected = viewShowing(1, [
    [1, 2],
    [2, 3],
  ]);

  expect(result.state.defaultView).toEqual(expected);
  expect(viewOf(result.state, 1)).toEqual(expected);

  expect(viewOf(result.state, 2)).toEqual(
    viewShowing(2, [
      [1, 1],
      [2, 3],
    ]),
  );
});

const failedStart = (state: State, number: number): Applied =>
  fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(number),
    generation: number,
    message: 'no shell',
  });

it('returns each view a failed workspace start moved to its own earlier workspace', () => {
  const base = withViews(twoClients(createPhi, createDocs), [
    viewShowing(2, [
      [1, 1],
      [2, 2],
    ]),
    viewShowing(1, [
      [1, 1],
      [2, 2],
    ]),
    viewShowing(2, [
      [1, 1],
      [2, 2],
    ]),
  ]);

  const terminal = intent(base, { ...createApi, clientId: clientId(1) }).state;
  const terminalFailed = failedStart(terminal, 3).state;

  expect(focusedIn(terminalFailed, 1)).toBe(workspaceId(1));
  expect(focusedIn(terminalFailed, 2)).toBe(workspaceId(2));
  expect(terminalFailed.defaultView.focusedWorkspaceId).toBe(workspaceId(2));

  const cli = intent(base, createApi).state;

  const moved = intent(cli, {
    type: 'focusWorkspace',
    workspaceId: workspaceId(1),
    clientId: clientId(2),
  }).state;

  const cliFailed = failedStart(moved, 3).state;

  expect(focusedIn(cliFailed, 1)).toBe(workspaceId(1));
  expect(focusedIn(cliFailed, 2)).toBe(workspaceId(1));
  expect(cliFailed.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  const untouched = failedStart(cli, 3).state;

  expect(focusedIn(untouched, 1)).toBe(workspaceId(1));
  expect(focusedIn(untouched, 2)).toBe(workspaceId(2));
  expect(untouched.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('returns each view a failed tab start moved to its own earlier tab', () => {
  const base = withViews(twoClients(createPhi, createTab), [
    viewShowing(1, [[1, 2]]),
    viewShowing(1, [[1, 1]]),
    viewShowing(1, [[1, 2]]),
  ]);

  const created = intent(base, { type: 'createTab', workspaceId: workspaceId(1) }).state;
  const failed = failedStart(created, 3).state;

  expect(activeIn(failed, 1, 1)).toBe(tabId(1));
  expect(activeIn(failed, 2, 1)).toBe(tabId(2));
  expect(activeTabOf(failed.defaultView, workspaceId(1))).toBe(tabId(2));

  const moved = intent(created, {
    type: 'focusTab',
    tabId: tabId(1),
    clientId: clientId(2),
  }).state;

  const keeps = failedStart(moved, 3).state;

  expect(activeIn(keeps, 1, 1)).toBe(tabId(1));
  expect(activeIn(keeps, 2, 1)).toBe(tabId(1));
  expect(activeTabOf(keeps.defaultView, workspaceId(1))).toBe(tabId(1));
});

it('removes a failed pane when it is closed, and saves it until then', () => {
  const { result } = failRestoredSecondPane();
  const saved = savedSessionOf(result.state, noFolders);

  expect(saved.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);

  const closed = intent(result.state, { type: 'closePane', paneId: paneId(2) });

  expect(closed.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(closed.changes.map((change) => change.type)).toContain('paneRemoved');
});

it('saves a folder that was read, and keeps the restored folder for a pane with none read', () => {
  const saved = savedSessionOf(run(richSession), noFolders);

  const withFolders = {
    ...saved,
    panes: saved.panes.map((pane) => ({
      id: pane.id,
      tabId: pane.tabId,
      startFolder: `/restored/${pane.id}`,
    })),
  };

  const restored = intent(attachedEmpty(), { type: 'restoreSession', session: withFolders }).state;
  const read = new Map([[paneId(1), '/read/one']]);
  const next = savedSessionOf(restored, read);

  expect(next.panes.map((pane) => pane.startFolder)).toEqual([
    '/read/one',
    '/restored/pane-2',
    '/restored/pane-3',
    '/restored/pane-4',
  ]);

  expect(savedSessionOf(run(richSession), noFolders).panes.map((pane) => pane.startFolder)).toEqual(
    [undefined, undefined, undefined, undefined],
  );
});
