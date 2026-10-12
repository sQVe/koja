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
      focusedWorkspaceId: change.workspace.id,
    };
  }

  if (change.type === 'tabAdded') {
    return { ...snapshot, tabs: [...snapshot.tabs, change.tab] };
  }

  return snapshot;
};

const applyPaneChange = (snapshot: StoreSnapshot, change: StoreChange): StoreSnapshot => {
  if (change.type === 'paneAdded') {
    return { ...snapshot, panes: [...snapshot.panes, change.pane] };
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
