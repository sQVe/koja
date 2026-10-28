import { invariant } from '../invariant.ts';
import { isLive, lonePaneSize, tabPaneSizes } from './paneSizes.ts';
import type { Change, Pane, SavedSession, State, View, WorkspaceRecord } from './store.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome } from './transitionOutcome.ts';
import { clientViewChanges } from './view.ts';

export const stopServer = (state: State): Outcome => {
  if (state.stopping) {
    return propose(state, []);
  }

  const changes: Change[] = [];

  const panes = state.panes.map((pane) => {
    if (!isLive(pane)) {
      return pane;
    }

    changes.push({
      type: 'paneStateChanged',
      paneId: pane.id,
      lifecycle: 'closing',
      exitCode: undefined,
      error: undefined,
    });

    return { ...pane, lifecycle: 'closing' as const };
  });

  changes.push({ type: 'serverStopping' });

  return propose({ ...state, panes, stopping: true }, changes);
};

export const restoreSession = (state: State, session: SavedSession): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  if (state.workspaces.length > 0) {
    return refuse('sessionNotEmpty');
  }

  // A pane hidden by zoom has no shown size, so it starts at its size in the unzoomed layout.
  const unzoomed = session.tabs.map((tab) => ({ ...tab, zoomedPaneId: undefined }));

  const sizes = new Map([
    ...tabPaneSizes(unzoomed, state.layoutArea),
    ...tabPaneSizes(session.tabs, state.layoutArea),
  ]);

  const panes = session.panes.map((saved, index): Pane => {
    // A tab without room for its panes gives them no size.
    const size = sizes.get(saved.id) ?? lonePaneSize(state, saved.id);

    return {
      id: saved.id,
      tabId: saved.tabId,
      lifecycle: 'starting',
      size,
      generation: state.nextGeneration + index,
      exitCode: undefined,
      startFolder: saved.startFolder,
      restored: true,
      error: undefined,
    };
  });

  const defaultView: View = {
    focusedWorkspaceId: session.focusedWorkspaceId,
    activeTabs: session.workspaces.map((workspace) => ({
      workspaceId: workspace.id,
      tabId: workspace.activeTabId,
    })),
    scrolls: [],
  };

  const { focusedWorkspaceId } = session;
  const workspaces: WorkspaceRecord[] = [];
  const changes: Change[] = [];

  for (const { id, root, label, tabIds, activeTabId } of session.workspaces) {
    const workspace: WorkspaceRecord = { id, root, label, tabIds };

    invariant(focusedWorkspaceId !== undefined, 'A saved session with workspaces has no focus.');
    workspaces.push(workspace);
    changes.push({ type: 'workspaceAdded', workspace, activeTabId, focusedWorkspaceId });
  }

  const next: State = {
    ...state,
    workspaces,
    tabs: session.tabs,
    panes,
    defaultView,
    clients: state.clients.map((client) => ({ ...client, view: defaultView })),
    nextWorkspaceNumber: Math.max(state.nextWorkspaceNumber, session.nextWorkspaceNumber),
    nextTabNumber: Math.max(state.nextTabNumber, session.nextTabNumber),
    nextPaneNumber: Math.max(state.nextPaneNumber, session.nextPaneNumber),
    nextGeneration: state.nextGeneration + panes.length,
  };

  for (const tab of session.tabs) {
    changes.push({ type: 'tabAdded', tab });
  }

  for (const pane of panes) {
    changes.push({ type: 'paneAdded', pane });
  }

  changes.push(...clientViewChanges(state.clients, next.clients));

  return propose(next, changes);
};
