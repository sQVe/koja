import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { applyChange, focusedPane } from './snapshot.ts';
import type { StoreSnapshot } from './snapshot.ts';

const size = { columns: 80, rows: 24 };

const first = { id: clientId(1), size, theme: undefined };

const second = { id: clientId(2), size, theme: undefined };

const snapshot: StoreSnapshot = {
  revision: 3,
  workspaces: [
    {
      id: workspaceId(1),
      root: '/work/phi',
      label: 'phi',
      tabIds: [tabId(1)],
      activeTabId: tabId(1),
    },
  ],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout: { kind: 'pane', paneId: paneId(1) },
      focusedPaneId: paneId(1),
      zoomedPaneId: undefined,
    },
  ],
  panes: [
    {
      id: paneId(1),
      tabId: tabId(1),
      lifecycle: 'running',
      generation: 1,
      size,
      exitCode: undefined,
    },
  ],
  focusedWorkspaceId: workspaceId(1),
  attachedClientId: first.id,
  clients: [first],
};

it('replaces the attached client when a client takes over', () => {
  const detached = applyChange(snapshot, {
    type: 'clientDetached',
    clientId: first.id,
    reason: 'takenOver',
  });

  const attached = applyChange(detached, { type: 'clientAttached', client: second });

  expect(attached.clients).toEqual([second]);
  expect(attached.attachedClientId).toBe(second.id);
});

it('records the exit of the pane', () => {
  const exited = applyChange(snapshot, {
    type: 'paneStateChanged',
    paneId: paneId(1),
    lifecycle: 'exited',
    exitCode: 3,
  });

  expect(focusedPane(exited)?.lifecycle).toBe('exited');
  expect(focusedPane(exited)?.exitCode).toBe(3);
});

it('resizes only the client the change names', () => {
  const resized = { columns: 100, rows: 30 };
  const both = { ...snapshot, clients: [first, second] };
  const next = applyChange(both, { type: 'clientResized', clientId: second.id, size: resized });

  expect(next.clients).toEqual([first, { ...second, size: resized }]);
});

it('records the theme of only the client the change names', () => {
  const theme = { foreground: 1, background: 2, palette: Array.from({ length: 16 }, () => 3) };
  const both = { ...snapshot, clients: [first, second] };
  const next = applyChange(both, { type: 'clientThemeChanged', clientId: second.id, theme });

  expect(next.clients).toEqual([first, { ...second, theme }]);
});

const secondWorkspace = {
  id: workspaceId(2),
  root: '/work/docs',
  label: 'docs',
  tabIds: [tabId(2)],
  activeTabId: tabId(2),
};

const secondTab = {
  id: tabId(2),
  workspaceId: workspaceId(2),
  layout: { kind: 'pane' as const, paneId: paneId(2) },
  focusedPaneId: paneId(2),
  zoomedPaneId: undefined,
};

const secondPane = {
  id: paneId(2),
  tabId: tabId(2),
  lifecycle: 'running' as const,
  generation: 2,
  size,
  exitCode: undefined,
};

const withSecond: StoreSnapshot = {
  ...snapshot,
  workspaces: [...snapshot.workspaces, secondWorkspace],
  tabs: [...snapshot.tabs, secondTab],
  panes: [...snapshot.panes, secondPane],
  focusedWorkspaceId: secondWorkspace.id,
};

it('focuses a workspace', () => {
  const next = applyChange(withSecond, { type: 'workspaceFocused', workspaceId: workspaceId(1) });

  expect(next.focusedWorkspaceId).toBe(workspaceId(1));
  expect(focusedPane(next)?.id).toBe(paneId(1));
});

it('renames only the workspace the change names', () => {
  const next = applyChange(withSecond, {
    type: 'workspaceRenamed',
    workspaceId: workspaceId(2),
    label: 'notes',
  });

  expect(next.workspaces.map((workspace) => workspace.label)).toEqual(['phi', 'notes']);
});

it('removes a workspace with its tab and pane and takes the focus the change names', () => {
  const removed = [
    { type: 'paneRemoved', paneId: paneId(2) },
    { type: 'tabRemoved', tabId: tabId(2) },
    { type: 'workspaceRemoved', workspaceId: workspaceId(2), focusedWorkspaceId: workspaceId(1) },
  ] as const;

  const next = removed.reduce(applyChange, withSecond);

  expect(next.workspaces).toEqual(snapshot.workspaces);
  expect(next.tabs).toEqual(snapshot.tabs);
  expect(next.panes).toEqual(snapshot.panes);
  expect(next.focusedWorkspaceId).toBe(workspaceId(1));
});

it('keeps the focused workspace and pane when a background workspace is added', () => {
  const workspace = {
    id: workspaceId(2),
    root: '/work/other',
    label: 'other',
    tabIds: [tabId(2)],
    activeTabId: tabId(2),
  };

  const added = applyChange(snapshot, {
    type: 'workspaceAdded',
    workspace,
    focusedWorkspaceId: workspaceId(1),
  });

  expect(added.workspaces).toHaveLength(2);
  expect(added.focusedWorkspaceId).toBe(workspaceId(1));
  expect(focusedPane(added)).toEqual(snapshot.panes[0]);
});
