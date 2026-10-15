import { paneId, tabId, workspaceId } from '../ids.ts';
import type { ClientId, WorkspaceId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { lonePaneSize } from './paneSizes.ts';
import type { Change, Intent, Pane, State, Tab, WorkspaceRecord } from './store.ts';
import { removeTab } from './tabTransitions.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome } from './transitionOutcome.ts';
import {
  activeTabOf,
  clientViewChanges,
  repairViews,
  updateViews,
  viewChanges,
  viewsBefore,
  withActiveTab,
} from './view.ts';

type CreateWorkspaceIntent = Extract<Intent, { type: 'createWorkspace' }>;

const defaultLabel = (root: string): string => {
  const trimmed = root.replace(/\/+$/, '');
  const baseName = trimmed.slice(trimmed.lastIndexOf('/') + 1);

  return baseName === '' ? root : baseName;
};

// The views of a closing workspace move once, not after each of its tabs.
const isNotViewChange = (change: Change): boolean =>
  change.type !== 'tabFocused' && change.type !== 'clientViewChanged';

export const createWorkspace = (state: State, intent: CreateWorkspaceIntent): Outcome => {
  const { root, label, focus, clientId: source } = intent;

  if (state.stopping) {
    return refuse('serverStopping');
  }

  const newPaneId = paneId(state.nextPaneNumber);

  const pane: Pane = {
    id: newPaneId,
    tabId: tabId(state.nextTabNumber),
    lifecycle: 'starting',
    size: lonePaneSize(state, newPaneId),
    generation: state.nextGeneration,
    exitCode: undefined,
    startFolder: undefined,
    restored: false,
    error: undefined,
  };

  const tab: Tab = {
    id: pane.tabId,
    workspaceId: workspaceId(state.nextWorkspaceNumber),
    layout: { kind: 'pane', paneId: pane.id },
    focusedPaneId: pane.id,
    zoomedPaneId: undefined,
  };

  const workspace: WorkspaceRecord = {
    id: tab.workspaceId,
    root,
    label: label ?? defaultLabel(root),
    tabIds: [tab.id],
  };

  // A view with no focus takes the first workspace, focus or not.
  const added = repairViews(state, (view) => ({
    ...withActiveTab(view, workspace.id, tab.id),
    focusedWorkspaceId: view.focusedWorkspaceId ?? workspace.id,
  }));

  const focused = focus
    ? updateViews(added, source, (view) => ({ ...view, focusedWorkspaceId: workspace.id }))
    : added;

  const next: State = {
    ...focused,
    workspaces: [...state.workspaces, workspace],
    tabs: [...state.tabs, tab],
    panes: [...state.panes, pane],
    startFallbacks: [
      ...state.startFallbacks,
      { paneId: pane.id, views: viewsBefore(state, source) },
    ],
    nextWorkspaceNumber: state.nextWorkspaceNumber + 1,
    nextTabNumber: state.nextTabNumber + 1,
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
  };

  const { focusedWorkspaceId } = next.defaultView;

  invariant(
    focusedWorkspaceId !== undefined,
    'A created workspace leaves the default view a focus.',
  );

  return propose(next, [
    { type: 'workspaceAdded', workspace, activeTabId: tab.id, focusedWorkspaceId },
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
    ...clientViewChanges(state.clients, next.clients),
  ]);
};

export const focusWorkspace = (
  state: State,
  id: WorkspaceId,
  source: ClientId | undefined,
): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  if (!state.workspaces.some((workspace) => workspace.id === id)) {
    return refuse('unknownWorkspace');
  }

  // The workspace goes with its remembered tab: the source client's, or the default view's for
  // the CLI. Every view in scope gets that pair, even one that already shows the workspace.
  const sourceView = state.clients.find((client) => client.id === source)?.view;
  const destination = activeTabOf(sourceView ?? state.defaultView, id);

  invariant(destination !== undefined, `Workspace ${id} has no active tab.`);

  const focused = updateViews(state, source, (view) => ({
    ...withActiveTab(view, id, destination),
    focusedWorkspaceId: id,
  }));

  return propose(focused, viewChanges(state, focused));
};

export const renameWorkspace = (state: State, id: WorkspaceId, label: string): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const renaming = state.workspaces.find((workspace) => workspace.id === id);

  if (renaming === undefined) {
    return refuse('unknownWorkspace');
  }

  if (renaming.label === label) {
    return propose(state, []);
  }

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === id ? { ...workspace, label } : workspace,
  );

  return propose({ ...state, workspaces }, [{ type: 'workspaceRenamed', workspaceId: id, label }]);
};

export const closeWorkspace = (state: State, id: WorkspaceId): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const closing = state.workspaces.find((workspace) => workspace.id === id);

  if (closing === undefined) {
    return refuse('unknownWorkspace');
  }

  let current: State = state;
  const changes: Change[] = [];

  for (const tab of state.tabs.filter((known) => known.workspaceId === id)) {
    const removed = removeTab(current, tab);

    current = removed.state;
    changes.push(...removed.changes.filter(isNotViewChange));
  }

  changes.push(...clientViewChanges(state.clients, current.clients));

  return propose(current, changes);
};
