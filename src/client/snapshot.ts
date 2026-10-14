import type { PaneId, TabId, WorkspaceId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';

export type StoreSnapshot = Extract<ControlMessage, { type: 'snapshot' }>['snapshot'];

export type StoreChange = Extract<ControlMessage, { type: 'change' }>['change'];

export type StoreView = StoreSnapshot['defaultView'];

const withActiveTab = (view: StoreView, id: WorkspaceId, activeId: TabId): StoreView => {
  const known = view.activeTabs.some((active) => active.workspaceId === id);

  const activeTabs = known
    ? view.activeTabs.map((active) =>
        active.workspaceId === id ? { workspaceId: id, tabId: activeId } : active,
      )
    : [...view.activeTabs, { workspaceId: id, tabId: activeId }];

  return { ...view, activeTabs };
};

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
      defaultView: {
        ...withActiveTab(snapshot.defaultView, change.workspace.id, change.activeTabId),
        focusedWorkspaceId: change.focusedWorkspaceId,
      },
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

  if (change.type === 'tabZoomChanged') {
    const tabs = snapshot.tabs.map((tab) =>
      tab.id === change.tabId ? { ...tab, zoomedPaneId: change.zoomedPaneId } : tab,
    );

    return { ...snapshot, tabs };
  }

  if (change.type === 'workspaceFocused') {
    return {
      ...snapshot,
      defaultView: { ...snapshot.defaultView, focusedWorkspaceId: change.workspaceId },
    };
  }

  if (change.type === 'tabFocused') {
    const defaultView = withActiveTab(snapshot.defaultView, change.workspaceId, change.tabId);

    return { ...snapshot, defaultView };
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
      defaultView: {
        focusedWorkspaceId: change.focusedWorkspaceId,
        activeTabs: snapshot.defaultView.activeTabs.filter(
          (active) => active.workspaceId !== change.workspaceId,
        ),
      },
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
    const { lifecycle, exitCode, error } = change;

    return updatePane(snapshot, change.paneId, (pane) => ({ ...pane, lifecycle, exitCode, error }));
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
      foregroundClientId: change.client.id,
      clients: [...snapshot.clients, change.client],
    };
  }

  if (change.type === 'clientViewChanged') {
    const clients = snapshot.clients.map((client) =>
      client.id === change.clientId ? { ...client, view: change.view } : client,
    );

    return { ...snapshot, clients };
  }

  if (change.type === 'foregroundChanged') {
    return { ...snapshot, foregroundClientId: change.clientId };
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
    const detachedForeground = snapshot.foregroundClientId === change.clientId;

    return {
      ...snapshot,
      attachedClientId: detachedAttached ? undefined : snapshot.attachedClientId,
      foregroundClientId: detachedForeground ? undefined : snapshot.foregroundClientId,
      clients: snapshot.clients.filter((client) => client.id !== change.clientId),
    };
  }

  return snapshot;
};

export const applyChange = (snapshot: StoreSnapshot, change: StoreChange): StoreSnapshot =>
  applyClientChange(applyPaneChange(applyLayoutChange(snapshot, change), change), change);

const paneOfView = (
  snapshot: StoreSnapshot,
  view: StoreView,
): StoreSnapshot['panes'][number] | undefined => {
  const { focusedWorkspaceId } = view;
  const active = view.activeTabs.find((known) => known.workspaceId === focusedWorkspaceId);
  const tab = snapshot.tabs.find((known) => known.id === active?.tabId);

  return snapshot.panes.find((known) => known.id === tab?.focusedPaneId);
};

// The view of the client this snapshot belongs to: the attached client's own, or the default
// view when no client is attached. Only one client attaches at a time.
export const shownView = (snapshot: StoreSnapshot): StoreView =>
  snapshot.clients.find((known) => known.id === snapshot.attachedClientId)?.view ??
  snapshot.defaultView;

export const activeTabIdOf = (view: StoreView, id: WorkspaceId | undefined): TabId | undefined =>
  view.activeTabs.find((active) => active.workspaceId === id)?.tabId;

// Mirrors the store's focusedPane: the client may not import the store at runtime.
export const focusedPane = (snapshot: StoreSnapshot): StoreSnapshot['panes'][number] | undefined =>
  paneOfView(snapshot, snapshot.defaultView);

export const viewedPane = (snapshot: StoreSnapshot): StoreSnapshot['panes'][number] | undefined =>
  paneOfView(snapshot, shownView(snapshot));
