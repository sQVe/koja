import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';

export type StoreSnapshot = Extract<ControlMessage, { type: 'snapshot' }>['snapshot'];

export type StoreChange = Extract<ControlMessage, { type: 'change' }>['change'];

const updatePane = (
  snapshot: StoreSnapshot,
  id: PaneId,
  update: (pane: StoreSnapshot['panes'][number]) => StoreSnapshot['panes'][number],
): StoreSnapshot => ({
  ...snapshot,
  panes: snapshot.panes.map((pane) => (pane.id === id ? update(pane) : pane)),
});

const applyLayoutChange = (snapshot: StoreSnapshot, change: StoreChange): StoreSnapshot => {
  if (change.type === 'workspaceAdded') {
    return {
      ...snapshot,
      workspaces: [...snapshot.workspaces, change.workspace],
      focusedWorkspaceId: change.focusedWorkspaceId,
    };
  }

  if (change.type === 'tabAdded') {
    const { tab } = change;

    // workspaceAdded already lists the first tab.
    const workspaces = snapshot.workspaces.map((workspace) =>
      workspace.id === tab.workspaceId && !workspace.tabIds.includes(tab.id)
        ? { ...workspace, tabIds: [...workspace.tabIds, tab.id] }
        : workspace,
    );

    return { ...snapshot, tabs: [...snapshot.tabs, tab], workspaces };
  }

  if (change.type === 'tabLayoutChanged') {
    const tabs = snapshot.tabs.map((tab) =>
      tab.id === change.tabId ? { ...tab, layout: change.layout } : tab,
    );

    return { ...snapshot, tabs };
  }

  if (change.type === 'paneFocused') {
    const tabs = snapshot.tabs.map((tab) =>
      tab.id === change.tabId ? { ...tab, focusedPaneId: change.paneId } : tab,
    );

    return { ...snapshot, tabs };
  }

  if (change.type === 'workspaceFocused') {
    return { ...snapshot, focusedWorkspaceId: change.workspaceId };
  }

  if (change.type === 'tabFocused') {
    const workspaces = snapshot.workspaces.map((workspace) =>
      workspace.id === change.workspaceId ? { ...workspace, activeTabId: change.tabId } : workspace,
    );

    return { ...snapshot, workspaces };
  }

  if (change.type === 'workspaceRenamed') {
    const workspaces = snapshot.workspaces.map((workspace) =>
      workspace.id === change.workspaceId ? { ...workspace, label: change.label } : workspace,
    );

    return { ...snapshot, workspaces };
  }

  if (change.type === 'workspaceRemoved') {
    return {
      ...snapshot,
      workspaces: snapshot.workspaces.filter((workspace) => workspace.id !== change.workspaceId),
      focusedWorkspaceId: change.focusedWorkspaceId,
    };
  }

  if (change.type === 'tabRemoved') {
    const tabs = snapshot.tabs.filter((tab) => tab.id !== change.tabId);

    const workspaces = snapshot.workspaces.map((workspace) => ({
      ...workspace,
      tabIds: workspace.tabIds.filter((id) => id !== change.tabId),
    }));

    return { ...snapshot, tabs, workspaces };
  }

  return snapshot;
};

const applyPaneChange = (snapshot: StoreSnapshot, change: StoreChange): StoreSnapshot => {
  if (change.type === 'paneAdded') {
    return { ...snapshot, panes: [...snapshot.panes, change.pane] };
  }

  if (change.type === 'paneRemoved') {
    return { ...snapshot, panes: snapshot.panes.filter((pane) => pane.id !== change.paneId) };
  }

  if (change.type === 'paneStateChanged') {
    const { lifecycle, exitCode } = change;

    return updatePane(snapshot, change.paneId, (pane) => ({ ...pane, lifecycle, exitCode }));
  }

  if (change.type === 'paneResized') {
    return updatePane(snapshot, change.paneId, (pane) => ({ ...pane, size: change.size }));
  }

  return snapshot;
};

const applyClientChange = (snapshot: StoreSnapshot, change: StoreChange): StoreSnapshot => {
  if (change.type === 'clientAttached') {
    return {
      ...snapshot,
      attachedClientId: change.client.id,
      clients: [...snapshot.clients, change.client],
    };
  }

  if (change.type === 'clientResized') {
    const clients = snapshot.clients.map((client) =>
      client.id === change.clientId ? { ...client, size: change.size } : client,
    );

    return { ...snapshot, clients };
  }

  if (change.type === 'clientThemeChanged') {
    const clients = snapshot.clients.map((client) =>
      client.id === change.clientId ? { ...client, theme: change.theme } : client,
    );

    return { ...snapshot, clients };
  }

  if (change.type === 'clientDetached') {
    const detachedAttached = snapshot.attachedClientId === change.clientId;

    return {
      ...snapshot,
      attachedClientId: detachedAttached ? undefined : snapshot.attachedClientId,
      clients: snapshot.clients.filter((client) => client.id !== change.clientId),
    };
  }

  return snapshot;
};

export const applyChange = (snapshot: StoreSnapshot, change: StoreChange): StoreSnapshot =>
  applyClientChange(applyPaneChange(applyLayoutChange(snapshot, change), change), change);

// Mirrors the store's focusedPane: the client may not import the store at runtime.
export const focusedPane = (
  snapshot: StoreSnapshot,
): StoreSnapshot['panes'][number] | undefined => {
  const workspace = snapshot.workspaces.find((known) => known.id === snapshot.focusedWorkspaceId);
  const tab = snapshot.tabs.find((known) => known.id === workspace?.activeTabId);

  return snapshot.panes.find((known) => known.id === tab?.focusedPaneId);
};
