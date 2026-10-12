import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { applyFact, applyIntent, createState, focusedPane, paneTheme, snapshot } from './store.ts';
import type {
  Applied,
  Fact,
  Ignored,
  Intent,
  Pane,
  Rejected,
  State,
  Tab,
  Theme,
  Workspace,
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
  };

  const tab: Tab = {
    id: tabId(1),
    workspaceId: workspaceId(1),
    layout: { kind: 'pane', paneId: paneId(1) },
    focusedPaneId: paneId(1),
    zoomedPaneId: undefined,
  };

  const workspace: Workspace = {
    id: workspaceId(1),
    root: '/work/phi',
    label: 'phi',
    tabIds: [tabId(1)],
    activeTabId: tabId(1),
  };

  expect(snapshot(result.state)).toEqual({
    revision: 3,
    workspaces: [workspace],
    tabs: [tab],
    panes: [pane],
    focusedWorkspaceId: workspaceId(1),
    attachedClientId: undefined,
    clients: [],
  });

  expect(focusedPane(result.state)).toEqual(pane);

  expect(result.changes).toEqual([
    { type: 'workspaceAdded', workspace, focusedWorkspaceId: workspace.id },
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
  expect(state.focusedWorkspaceId).toBe(workspaceId(2));
});

it('focuses a workspace', () => {
  const state = run([createPhi, createDocs]);
  const result = intent(state, { type: 'focusWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.focusedWorkspaceId).toBe(workspaceId(1));
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
  expect(result.state.focusedWorkspaceId).toBe(workspaceId(2));
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

  expect(result.state.focusedWorkspaceId).toBe(workspaceId(3));
});

it('focuses the previous workspace when the focused last one closes', () => {
  const state = run([createPhi, createDocs, createApi]);
  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(3) });

  expect(result.state.focusedWorkspaceId).toBe(workspaceId(2));
});

it('keeps the focus when an unfocused workspace closes', () => {
  const state = run([createPhi, createDocs]);
  const result = intent(state, { type: 'closeWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.focusedWorkspaceId).toBe(workspaceId(2));
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
  const client = { id: clientId(1), size: { columns: 100, rows: 30 }, theme: undefined };

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
  const client = { id: clientId(2), size: { columns: 90, rows: 20 }, theme: undefined };

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
    { type: 'paneStateChanged', paneId: paneId(1), lifecycle: 'closing', exitCode: undefined },
    { type: 'serverStopping' },
  ]);

  expect(intent(stopped.state, { type: 'stopServer' }).changes).toEqual([]);
});

it('marks a started pane as running', () => {
  const state = run([createPhi]);
  const result = fact(state, { type: 'paneStarted', ...firstPane });

  expect(result.state.panes[0]?.lifecycle).toBe('running');

  expect(result.changes).toEqual([
    { type: 'paneStateChanged', paneId: paneId(1), lifecycle: 'running', exitCode: undefined },
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
  expect(result.state.focusedWorkspaceId).toBeUndefined();
  expect(result.state.stopping).toBe(false);

  expect(result.changes).toEqual([
    { type: 'paneRemoved', paneId: paneId(1) },
    { type: 'tabRemoved', tabId: tabId(1) },
    { type: 'workspaceRemoved', workspaceId: workspaceId(1), focusedWorkspaceId: undefined },
  ]);
});

it('removes the workspace of a pane that fails to start, and keeps running', () => {
  const result = fact(run([createPhi]), { type: 'paneFailedToStart', ...firstPane });

  expect(result.state.workspaces).toEqual([]);
  expect(result.state.panes).toEqual([]);
  expect(result.state.stopping).toBe(false);
  expect(result.changes.some((change) => change.type === 'serverStopping')).toBe(false);
});

it('keeps the other workspaces when one pane exits', () => {
  const state = run([createPhi, createDocs]);
  const result = fact(state, { type: 'paneExited', ...firstPane, exitCode: 0 });

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(2)]);
  expect(result.state.focusedWorkspaceId).toBe(workspaceId(2));
});

it('marks a closing pane exited without removing it while the server stops', () => {
  const state = run([createPhi, { type: 'stopServer' }]);
  const result = fact(state, { type: 'paneExited', ...firstPane, exitCode: 0 });

  expect(result.changes).toEqual([
    { type: 'paneStateChanged', paneId: paneId(1), lifecycle: 'exited', exitCode: 0 },
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
    focusedWorkspaceId: workspaceId(1),
    attachedClientId: clientId(1),
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

  expect(result.state.focusedWorkspaceId).toBe(workspaceId(1));
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

  expect(result.state.focusedWorkspaceId).toBe(workspaceId(1));
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

const workspaceOne = (state: State): Workspace => {
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
  };

  const tab: Tab = {
    id: tabId(2),
    workspaceId: workspaceId(1),
    layout: { kind: 'pane', paneId: paneId(2) },
    focusedPaneId: paneId(2),
    zoomedPaneId: undefined,
  };

  expect(workspaceOne(result.state)).toMatchObject({
    tabIds: [tabId(1), tabId(2)],
    activeTabId: tabId(2),
  });

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

  expect(workspaceOne(result.state).activeTabId).toBe(tabId(1));
  expect(result.state.focusedWorkspaceId).toBe(workspaceId(1));

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
  expect(workspaceOne(result.state)).toMatchObject({ tabIds: [tabId(2)], activeTabId: tabId(2) });
});

it('removes the workspace when its only tab closes', () => {
  const result = intent(run([createPhi]), { type: 'closeTab', tabId: tabId(1) });

  expect(result.state.workspaces).toEqual([]);
  expect(result.state.focusedWorkspaceId).toBeUndefined();
});

it('hands activity to the next tab when the active middle tab closes', () => {
  const state = run([createPhi, createTab, createTab, { type: 'focusTab', tabId: tabId(2) }]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(2) });

  expect(workspaceOne(result.state)).toMatchObject({
    tabIds: [tabId(1), tabId(3)],
    activeTabId: tabId(3),
  });

  expect(result.changes).toContainEqual({
    type: 'tabFocused',
    workspaceId: workspaceId(1),
    tabId: tabId(3),
  });
});

it('hands activity to the previous tab when the active last tab closes', () => {
  const state = run([createPhi, createTab]);
  const result = intent(state, { type: 'closeTab', tabId: tabId(2) });

  expect(workspaceOne(result.state).activeTabId).toBe(tabId(1));

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

  expect(workspaceOne(result.state)).toMatchObject({ tabIds: [tabId(1)], activeTabId: tabId(1) });
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

  const result = fact(state, { type: 'paneFailedToStart', paneId: paneId(3), generation: 3 });
  const owner = result.state.workspaces[0];

  expect(owner?.tabIds).toEqual([tabId(1), tabId(2)]);
  expect(owner?.activeTabId).toBe(tabId(1));
});

it('keeps the workspace that was focused when the pane of a new workspace fails to start', () => {
  const state = run([
    createPhi,
    createDocs,
    { type: 'focusWorkspace', workspaceId: workspaceId(1) },
    { type: 'createWorkspace', root: '/work/api', label: 'api', background: false },
  ]);

  const result = fact(state, { type: 'paneFailedToStart', paneId: paneId(3), generation: 3 });

  expect(result.state.focusedWorkspaceId).toBe(workspaceId(1));

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
    { columns: 79, rows: 9 },
  ]);
});

it('splits a pane inside a split at half the area of that pane', () => {
  const state = run([createPhi, attachLarge, splitFirst('right')]);

  const result = intent(state, { type: 'splitPane', paneId: paneId(2), direction: 'below' });

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 38, rows: 22 },
    { columns: 38, rows: 10 },
    { columns: 38, rows: 9 },
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
    { columns: 79, rows: 9 },
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

  const result = fact(split.state, { type: 'paneFailedToStart', paneId: paneId(3), generation: 3 });

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
  const result = fact(state, { type: 'paneFailedToStart', paneId: paneId(2), generation: 2 });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
});
