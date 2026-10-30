import { paneId, tabId } from '../ids.ts';
import type { ClientId, TabId, WorkspaceId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { masterArrangement } from '../layout.ts';
import type { Layout } from '../layout.ts';
import { lonePaneSize } from './paneSizes.ts';
import { withoutStartupRecords } from './paneStartupRecords.ts';
import { withoutPiRecords } from './piRecoveryRecords.ts';
import type {
  Change,
  Intent,
  Pane,
  StartFallback,
  State,
  Tab,
  View,
  WorkspaceRecord,
} from './store.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome, Proposal } from './transitionOutcome.ts';
import {
  activeTabOf,
  clientViewChanges,
  repairViews,
  updateViews,
  viewChanges,
  viewsBefore,
  withActiveTab,
} from './view.ts';

type CreateTabIntent = Extract<Intent, { type: 'createTab' }>;

const withoutWorkspace = (view: View, id: WorkspaceId): View => ({
  ...view,
  activeTabs: view.activeTabs.filter((active) => active.workspaceId !== id),
});

const viewBeforeOf = (restore: StartFallback | undefined, owner?: ClientId): View | undefined =>
  restore?.views.find((known) => known.clientId === owner)?.view;

// The next workspace in list order takes the focus, or the previous one when it was last.
const workspaceAfterRemoval = (state: State, removedId: WorkspaceId): WorkspaceId | undefined => {
  const index = state.workspaces.findIndex((workspace) => workspace.id === removedId);
  const neighbor = state.workspaces[index + 1] ?? state.workspaces[index - 1];

  return neighbor?.id;
};

// The previous tab in list order becomes active, or the next one when the closed tab was first.
const tabAfterRemoval = (owner: WorkspaceRecord, removedId: TabId): TabId | undefined => {
  const index = owner.tabIds.indexOf(removedId);

  return owner.tabIds[index - 1] ?? owner.tabIds[index + 1];
};

export const removeWorkspace = (
  state: State,
  id: WorkspaceId,
  restore?: StartFallback,
): Proposal => {
  const ordinary = workspaceAfterRemoval(state, id);

  const repaired = repairViews(state, (view, viewOwner) => {
    const withoutOwner = withoutWorkspace(view, id);
    const earlier = viewBeforeOf(restore, viewOwner)?.focusedWorkspaceId;
    const isKnown = state.workspaces.some((workspace) => workspace.id === earlier);
    const restored = isKnown && earlier !== id ? earlier : undefined;

    return view.focusedWorkspaceId === id
      ? { ...withoutOwner, focusedWorkspaceId: restored ?? ordinary }
      : withoutOwner;
  });

  const workspaces = state.workspaces.filter((workspace) => workspace.id !== id);

  return propose({ ...repaired, workspaces }, [
    {
      type: 'workspaceRemoved',
      workspaceId: id,
      focusedWorkspaceId: repaired.defaultView.focusedWorkspaceId,
    },
    ...clientViewChanges(state.clients, repaired.clients),
  ]);
};

export const removeTab = (
  state: State,
  tab: Tab,
  restore?: StartFallback,
  keepWorkspace = false,
): Proposal => {
  const remaining = state.panes.filter((pane) => pane.tabId !== tab.id);
  const removedPanes = state.panes.filter((pane) => pane.tabId === tab.id);
  const changes: Change[] = removedPanes.map((pane) => ({ type: 'paneRemoved', paneId: pane.id }));

  changes.push({ type: 'tabRemoved', tabId: tab.id });

  const tabs = state.tabs.filter((known) => known.id !== tab.id);
  const owner = state.workspaces.find((workspace) => workspace.id === tab.workspaceId);

  invariant(owner !== undefined, `Tab ${tab.id} has no workspace.`);

  const tabIds = owner.tabIds.filter((id) => id !== tab.id);

  const removedIds = removedPanes.map((pane) => pane.id);

  const next: State = withoutPiRecords(
    withoutStartupRecords({ ...state, panes: remaining, tabs }, removedIds),
    removedIds,
  );

  if (tabIds.length > 0) {
    const neighbor = tabAfterRemoval(owner, tab.id);

    invariant(neighbor !== undefined, `Workspace ${owner.id} has no tab to activate.`);

    const workspaces = state.workspaces.map((workspace) =>
      workspace.id === owner.id ? { ...workspace, tabIds } : workspace,
    );

    // A view that showed the closed tab returns to its own earlier tab if that still exists. Else
    // the default view moves to the neighbor and client views follow the default view. A view that
    // moved on keeps its tab. A view still focused on the owner also returns to its earlier
    // workspace, which a focused create of the failed tab moved it from.
    const moveView = (view: View, viewOwner: ClientId | undefined, fallback: TabId): View => {
      if (activeTabOf(view, owner.id) !== tab.id) {
        return view;
      }

      const before = viewBeforeOf(restore, viewOwner);
      const earlier = activeTabOf(before ?? view, owner.id);
      const restored = tabIds.find((id) => id === earlier);
      const moved = withActiveTab(view, owner.id, restored ?? fallback);
      const earlierWorkspace = before?.focusedWorkspaceId;
      const isKnown = state.workspaces.some((workspace) => workspace.id === earlierWorkspace);
      const returns = isKnown && view.focusedWorkspaceId === owner.id;

      return returns ? { ...moved, focusedWorkspaceId: earlierWorkspace } : moved;
    };

    const defaultView = moveView(state.defaultView, undefined, neighbor);
    const defaultTab = activeTabOf(defaultView, owner.id) ?? neighbor;

    const repaired: State = {
      ...next,
      workspaces,
      defaultView,
      clients: state.clients.map((client) => ({
        ...client,
        view: moveView(client.view, client.id, defaultTab),
      })),
    };

    changes.push(...viewChanges(state, repaired));

    return propose(repaired, changes);
  }

  if (keepWorkspace) {
    const repaired = repairViews(next, (view, viewOwner) => {
      const cleared = withoutWorkspace(view, owner.id);
      const earlier = viewBeforeOf(restore, viewOwner)?.focusedWorkspaceId;
      const isKnown = state.workspaces.some((workspace) => workspace.id === earlier);
      const returns = isKnown && view.focusedWorkspaceId === owner.id;

      return returns ? { ...cleared, focusedWorkspaceId: earlier } : cleared;
    });

    const workspaces = state.workspaces.map((workspace) =>
      workspace.id === owner.id ? { ...workspace, tabIds } : workspace,
    );

    changes.push(...viewChanges(state, repaired));

    return propose({ ...repaired, workspaces }, changes);
  }

  const removed = removeWorkspace(next, owner.id, restore);

  return propose(removed.state, [...changes, ...removed.changes]);
};

export const showTab = (
  state: State,
  source: ClientId | undefined,
  owner: WorkspaceId,
  id: TabId,
): State =>
  updateViews(state, source, (view) => ({
    ...withActiveTab(view, owner, id),
    focusedWorkspaceId: owner,
  }));

export const createTab = (state: State, intent: CreateTabIntent): Outcome => {
  const { workspaceId: id, folder, focus, clientId: source } = intent;

  if (state.stopping) {
    return refuse('serverStopping');
  }

  const owner = state.workspaces.find((workspace) => workspace.id === id);

  if (owner === undefined) {
    return refuse('unknownWorkspace');
  }

  const newPaneId = paneId(state.nextPaneNumber);

  const pane: Pane = {
    id: newPaneId,
    tabId: tabId(state.nextTabNumber),
    lifecycle: 'starting',
    size: lonePaneSize(state, newPaneId),
    generation: state.nextGeneration,
    exitCode: undefined,
    startFolder: folder,
    restored: false,
    error: undefined,
  };

  const layout: Layout = { kind: 'pane', paneId: pane.id };

  const tab: Tab = {
    id: pane.tabId,
    workspaceId: id,
    layout,
    arrangement: masterArrangement(layout),
    focusedPaneId: pane.id,
    zoomedPaneId: undefined,
    label: undefined,
  };

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === id ? { ...workspace, tabIds: [...workspace.tabIds, tab.id] } : workspace,
  );

  const added =
    owner.tabIds.length === 0
      ? repairViews(state, (view) => withActiveTab(view, id, tab.id))
      : state;

  const shown = focus ? showTab(added, source, id, tab.id) : added;

  const next: State = {
    ...shown,
    workspaces,
    tabs: [...state.tabs, tab],
    panes: [...state.panes, pane],
    startFallbacks: [
      ...state.startFallbacks,
      {
        paneId: pane.id,
        existingEmptyWorkspaceId: owner.tabIds.length === 0 ? owner.id : undefined,
        views: viewsBefore(state, source),
      },
    ],
    nextTabNumber: state.nextTabNumber + 1,
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
  };

  return propose(next, [
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
    ...viewChanges(state, next),
  ]);
};

export const focusTab = (state: State, id: TabId, source: ClientId | undefined): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const tab = state.tabs.find((known) => known.id === id);

  if (tab === undefined) {
    return refuse('unknownTab');
  }

  const owner = state.workspaces.find((workspace) => workspace.id === tab.workspaceId);

  invariant(owner !== undefined, `Tab ${id} has no workspace.`);

  const focused = showTab(state, source, owner.id, id);

  return propose(focused, viewChanges(state, focused));
};

export const renameTab = (state: State, id: TabId, label: string): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const renaming = state.tabs.find((tab) => tab.id === id);

  if (renaming === undefined) {
    return refuse('unknownTab');
  }

  if (renaming.label === label) {
    return propose(state, []);
  }

  const tabs = state.tabs.map((tab) => (tab.id === id ? { ...tab, label } : tab));

  return propose({ ...state, tabs }, [{ type: 'tabRenamed', tabId: id, label }]);
};

export const closeTab = (state: State, id: TabId): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const tab = state.tabs.find((known) => known.id === id);

  if (tab === undefined) {
    return refuse('unknownTab');
  }

  return removeTab(state, tab);
};
