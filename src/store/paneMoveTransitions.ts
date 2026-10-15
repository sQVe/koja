import { tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { canSplit, firstPaneId, layoutPanes, removePane, splitLayout } from '../layout.ts';
import type { PaneRectangle } from '../layout.ts';
import { fitPanes } from './paneSizes.ts';
import { unzoomChanges } from './paneTransitions.ts';
import type { Change, Intent, Pane, State, Tab, WorkspaceRecord } from './store.ts';
import { removeTab, showTab } from './tabTransitions.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome, Proposal, Refusal } from './transitionOutcome.ts';
import { clientViewChanges, repairViews, viewChanges, withActiveTab } from './view.ts';
import { defaultLabel } from './workspaceTransitions.ts';

type MovePaneIntent = Extract<Intent, { type: 'movePane' }>;

interface Placement {
  kind: 'placed';
  state: State;
  tab: Tab;
  changes: Change[];
}

const splitDirectionOf = (rectangle: PaneRectangle): 'right' | 'below' | undefined =>
  (['right', 'below'] as const).find((direction) => canSplit(rectangle, direction));

const withPaneIn = (state: State, id: PaneId, destination: Tab): State => {
  const stateBeforeSplit = new Map(state.stateBeforeSplit);

  stateBeforeSplit.delete(id);

  return {
    ...state,
    stateBeforeSplit,
    panes: state.panes.map((pane) => (pane.id === id ? { ...pane, tabId: destination.id } : pane)),
  };
};

const placeInTab = (state: State, pane: Pane, destination: Tab): Placement | Refusal => {
  const id = pane.id;
  const area = state.layoutArea;
  const target = destination.focusedPaneId;

  const rectangle = layoutPanes(destination.layout, area).find(
    (placed) => placed.paneId === target,
  );

  const direction = rectangle === undefined ? undefined : splitDirectionOf(rectangle);

  if (direction === undefined) {
    return refuse('paneTooSmall');
  }

  const layout = splitLayout(destination.layout, target, direction, id);
  const tab: Tab = { ...destination, layout, focusedPaneId: id, zoomedPaneId: undefined };
  const joined = withPaneIn(state, id, destination);

  // Only a pane that has not started gets its startup cleanup, which consumes this entry.
  const stateBeforeSplit = new Map(joined.stateBeforeSplit);

  if (pane.lifecycle === 'starting') {
    stateBeforeSplit.set(id, {
      focusedPaneId: destination.focusedPaneId,
      zoomedPaneId: destination.zoomedPaneId,
    });
  }

  const placed: State = {
    ...joined,
    tabs: state.tabs.map((known) => (known.id === tab.id ? tab : known)),
    stateBeforeSplit,
  };

  return {
    kind: 'placed',
    state: placed,
    tab,
    changes: [
      { type: 'paneMoved', paneId: id, tabId: tab.id },
      { type: 'tabLayoutChanged', tabId: tab.id, layout },
      { type: 'paneFocused', tabId: tab.id, paneId: id },
      ...unzoomChanges(destination),
    ],
  };
};

const placeInNewTab = (state: State, id: PaneId, source: Tab): Placement => {
  const tab: Tab = {
    id: tabId(state.nextTabNumber),
    workspaceId: source.workspaceId,
    layout: { kind: 'pane', paneId: id },
    focusedPaneId: id,
    zoomedPaneId: undefined,
  };

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === tab.workspaceId
      ? { ...workspace, tabIds: [...workspace.tabIds, tab.id] }
      : workspace,
  );

  const placed: State = {
    ...withPaneIn(state, id, tab),
    workspaces,
    tabs: [...state.tabs, tab],
    nextTabNumber: state.nextTabNumber + 1,
  };

  return {
    kind: 'placed',
    state: placed,
    tab,
    changes: [
      { type: 'tabAdded', tab },
      { type: 'paneMoved', paneId: id, tabId: tab.id },
    ],
  };
};

const placeInNewWorkspace = (state: State, id: PaneId, root: string): Placement => {
  const tab: Tab = {
    id: tabId(state.nextTabNumber),
    workspaceId: workspaceId(state.nextWorkspaceNumber),
    layout: { kind: 'pane', paneId: id },
    focusedPaneId: id,
    zoomedPaneId: undefined,
  };

  const workspace: WorkspaceRecord = {
    id: tab.workspaceId,
    root,
    label: defaultLabel(root),
    tabIds: [tab.id],
  };

  // A view with no focused workspace takes the new one, as a created workspace does.
  const registered = repairViews(state, (view) => ({
    ...withActiveTab(view, workspace.id, tab.id),
    focusedWorkspaceId: view.focusedWorkspaceId ?? workspace.id,
  }));

  const placed: State = {
    ...withPaneIn(registered, id, tab),
    workspaces: [...state.workspaces, workspace],
    tabs: [...state.tabs, tab],
    nextWorkspaceNumber: state.nextWorkspaceNumber + 1,
    nextTabNumber: state.nextTabNumber + 1,
  };

  const { focusedWorkspaceId } = placed.defaultView;

  invariant(focusedWorkspaceId !== undefined, 'A moved pane leaves the default view a focus.');

  return {
    kind: 'placed',
    state: placed,
    tab,
    changes: [
      { type: 'workspaceAdded', workspace, activeTabId: tab.id, focusedWorkspaceId },
      { type: 'tabAdded', tab },
      { type: 'paneMoved', paneId: id, tabId: tab.id },
      ...clientViewChanges(state.clients, placed.clients),
    ],
  };
};

const placementOf = (
  state: State,
  intent: MovePaneIntent,
  pane: Pane,
  source: Tab,
): Placement | Refusal => {
  const { destination } = intent;

  if (destination.kind === 'newTab') {
    return placeInNewTab(state, pane.id, source);
  }

  if (destination.kind === 'newWorkspace') {
    return placeInNewWorkspace(state, pane.id, destination.root);
  }

  const target = state.tabs.find((known) => known.id === destination.tabId);

  if (target === undefined) {
    return refuse('unknownTab');
  }

  if (target.id === source.id) {
    return refuse('sameTab');
  }

  return placeInTab(state, pane, target);
};

// The pane leaves its tab. The tab closes when nothing else is in it.
const detachFrom = (state: State, source: Tab, id: PaneId): Proposal => {
  const removal = removePane(source.layout, id);

  if (removal === undefined) {
    return removeTab(state, source);
  }

  const focusedPaneId =
    source.focusedPaneId === id ? firstPaneId(removal.sibling) : source.focusedPaneId;

  const zoomedPaneId = source.zoomedPaneId === id ? undefined : source.zoomedPaneId;
  const detached: Tab = { ...source, layout: removal.layout, focusedPaneId, zoomedPaneId };

  const changes: Change[] = [
    { type: 'tabLayoutChanged', tabId: source.id, layout: removal.layout },
  ];

  if (focusedPaneId !== source.focusedPaneId) {
    changes.push({ type: 'paneFocused', tabId: source.id, paneId: focusedPaneId });
  }

  if (zoomedPaneId !== source.zoomedPaneId) {
    changes.push({ type: 'tabZoomChanged', tabId: source.id, zoomedPaneId });
  }

  const next: State = {
    ...state,
    tabs: state.tabs.map((known) => (known.id === source.id ? detached : known)),
  };

  return propose(next, changes);
};

export const movePane = (state: State, intent: MovePaneIntent): Outcome => {
  const { paneId: id, clientId: viewer } = intent;

  if (state.stopping) {
    return refuse('serverStopping');
  }

  const pane = state.panes.find((known) => known.id === id);
  const source = state.tabs.find((known) => known.id === pane?.tabId);

  if (pane === undefined || source === undefined) {
    return refuse('unknownPane');
  }

  const placement = placementOf(state, intent, pane, source);

  if (placement.kind === 'refused') {
    return placement;
  }

  const detached = detachFrom(placement.state, source, id);
  const shown = showTab(detached.state, viewer, placement.tab.workspaceId, placement.tab.id);
  const fitted = fitPanes(shown);

  return propose({ ...shown, panes: fitted.panes }, [
    ...placement.changes,
    ...detached.changes,
    ...viewChanges(detached.state, shown),
    ...fitted.changes,
  ]);
};
