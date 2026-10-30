import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { activeTabOf } from './store.ts';
import type { State, WorkspaceRecord } from './store.ts';
import {
  createDocs,
  createKoja,
  createTab,
  defined,
  intent,
  run,
  twoClients,
} from './storeFixtures.ts';

const workspaceOne = (state: State): WorkspaceRecord =>
  defined(state.workspaces.find((workspace) => workspace.id === workspaceId(1)));

it('closing the last pane keeps an empty workspace', () => {
  const result = intent(run([createKoja]), { type: 'closePane', paneId: paneId(1) });

  expect(workspaceOne(result.state).tabIds).toEqual([]);
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(result.state.defaultView.activeTabs).toEqual([]);
  expect(result.state.panes).toEqual([]);
  expect(result.state.startFallbacks).toEqual([]);
  expect(result.changes.filter((change) => change.type === 'paneAdded')).toEqual([]);
});

it('clears only the emptied workspace and reports the repaired client views', () => {
  const state = twoClients(createKoja, createDocs);
  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(result.state.workspaces.map((workspace) => workspace.tabIds)).toEqual([[tabId(1)], []]);

  for (const client of result.state.clients) {
    expect(client.view.activeTabs).toEqual([{ workspaceId: workspaceId(1), tabId: tabId(1) }]);
    expect(client.view.focusedWorkspaceId).toBe(workspaceId(2));

    expect(result.changes).toContainEqual({
      type: 'clientViewChanged',
      clientId: client.id,
      view: client.view,
    });
  }
});

it('gives every view an active tab when an empty workspace gains its first tab without focus', () => {
  const empty = intent(twoClients(createKoja), { type: 'closePane', paneId: paneId(1) }).state;
  const result = intent(empty, { ...createTab, focus: false, clientId: clientId(1) });

  for (const view of [
    result.state.defaultView,
    ...result.state.clients.map((client) => client.view),
  ]) {
    expect(activeTabOf(view, workspaceId(1))).toBe(tabId(2));
  }

  expect(result.changes).toContainEqual({
    type: 'tabFocused',
    workspaceId: workspaceId(1),
    tabId: tabId(2),
  });
});

it('closes an empty workspace and repairs every view', () => {
  const empty = intent(twoClients(createKoja), { type: 'closePane', paneId: paneId(1) }).state;
  const result = intent(empty, { type: 'closeWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.workspaces).toEqual([]);
  expect(result.state.defaultView.focusedWorkspaceId).toBeUndefined();

  expect(result.state.clients.every((client) => client.view.focusedWorkspaceId === undefined)).toBe(
    true,
  );

  expect(result.changes).toContainEqual({
    type: 'workspaceRemoved',
    workspaceId: workspaceId(1),
    focusedWorkspaceId: undefined,
  });
});

it('focuses an empty workspace', () => {
  const empty = intent(run([createKoja, createDocs]), {
    type: 'closePane',
    paneId: paneId(1),
  }).state;

  const result = intent(empty, { type: 'focusWorkspace', workspaceId: workspaceId(1) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  expect(result.state.defaultView.activeTabs).toEqual([
    { workspaceId: workspaceId(2), tabId: tabId(2) },
  ]);
});
