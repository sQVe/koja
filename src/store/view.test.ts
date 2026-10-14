import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { activeTabOf, applyIntent, savedSessionOf } from './store.ts';
import type { Applied, State } from './store.ts';
import {
  attachLarge,
  createApi,
  createDocs,
  createPhi,
  createTab,
  fact,
  intent,
  noFolders,
  run,
  twoClients,
  viewShowing,
  withViews,
} from './storeFixtures.ts';

const viewOf = (state: State, id: number) =>
  state.clients.find((client) => client.id === clientId(id))?.view;

const focusedIn = (state: State, id: number) => viewOf(state, id)?.focusedWorkspaceId;

const activeIn = (state: State, id: number, workspace: number) => {
  const view = viewOf(state, id);

  return view === undefined ? undefined : activeTabOf(view, workspaceId(workspace));
};

const workspaceTabs = twoClients(createPhi, createTab, createDocs);

const failedStart = (state: State, number: number): Applied =>
  fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(number),
    generation: number,
    message: 'no shell',
  });

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

  const tab = intent(workspace.state, {
    type: 'createTab',
    workspaceId: workspaceId(2),
    folder: undefined,
  });

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

  const created = intent(base, createTab).state;
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
