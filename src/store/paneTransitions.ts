import { paneId } from '../ids.ts';
import type { ClientId, PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import {
  canSplit,
  firstPaneId,
  layoutPanes,
  removePane,
  resizeLayout,
  splitLayout,
} from '../layout.ts';
import { fitPanes, fitPanesTo } from './paneSizes.ts';
import type { Change, Fact, Intent, Pane, StartFallback, State, Tab } from './store.ts';
import { removeTab, showTab } from './tabTransitions.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome, Proposal } from './transitionOutcome.ts';
import { viewChanges } from './view.ts';

type SplitPaneIntent = Extract<Intent, { type: 'splitPane' }>;
type ResizePaneIntent = Extract<Intent, { type: 'resizePane' }>;

export const unzoomChanges = (tab: Tab): Change[] =>
  tab.zoomedPaneId === undefined
    ? []
    : [{ type: 'tabZoomChanged', tabId: tab.id, zoomedPaneId: undefined }];

const isInTab = (state: State, id: PaneId, tab: Tab): boolean =>
  state.panes.some((pane) => pane.id === id && pane.tabId === tab.id);

// The zoomed pane must stay the focused pane, so the zoom comes back only with its focus.
const restoredZoom = (
  state: State,
  tab: Tab,
  id: PaneId,
  focusedPaneId: PaneId,
): PaneId | undefined => {
  const zoomed = state.stateBeforeSplit.get(id)?.zoomedPaneId;
  const zoomStays = zoomed !== undefined && zoomed !== id && isInTab(state, zoomed, tab);

  return zoomStays && zoomed === focusedPaneId ? zoomed : undefined;
};

const replacePane = (state: State, replacement: Pane): readonly Pane[] =>
  state.panes.map((pane) => (pane.id === replacement.id ? replacement : pane));

export const splitPane = (state: State, intent: SplitPaneIntent): Outcome => {
  const { paneId: id, direction, folder } = intent;

  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return refuse('unknownPane');
  }

  const area = state.layoutArea;
  const rectangle = layoutPanes(tab.layout, area).find((placed) => placed.paneId === id);

  if (rectangle === undefined || !canSplit(rectangle, direction)) {
    return refuse('paneTooSmall');
  }

  const addedId = paneId(state.nextPaneNumber);
  const layout = splitLayout(tab.layout, id, direction, addedId);
  const addedRectangle = layoutPanes(layout, area).find((placed) => placed.paneId === addedId);

  invariant(addedRectangle !== undefined, `Split layout has no pane ${addedId}.`);

  const added: Pane = {
    id: addedId,
    tabId: tab.id,
    lifecycle: 'starting',
    size: { columns: addedRectangle.terminal.columns, rows: addedRectangle.terminal.rows },
    generation: state.nextGeneration,
    exitCode: undefined,
    startFolder: folder,
    restored: false,
    error: undefined,
  };

  const splitTab: Tab = { ...tab, layout, focusedPaneId: added.id, zoomedPaneId: undefined };

  const split: State = {
    ...state,
    tabs: state.tabs.map((known) => (known.id === tab.id ? splitTab : known)),
    panes: [...state.panes, added],
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
    stateBeforeSplit: new Map(state.stateBeforeSplit).set(added.id, {
      focusedPaneId: tab.focusedPaneId,
      zoomedPaneId: tab.zoomedPaneId,
    }),
  };

  const fitted = fitPanesTo(split, area);

  return propose({ ...split, panes: fitted.panes }, [
    { type: 'paneAdded', pane: added },
    { type: 'tabLayoutChanged', tabId: tab.id, layout },
    { type: 'paneFocused', tabId: tab.id, paneId: added.id },
    ...unzoomChanges(tab),
    ...fitted.changes,
  ]);
};

export const focusPane = (state: State, id: PaneId, source: ClientId | undefined): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return refuse('unknownPane');
  }

  const owner = state.workspaces.find((workspace) => workspace.id === tab.workspaceId);

  invariant(owner !== undefined, `Tab ${tab.id} has no workspace.`);

  const changes: Change[] = [];
  const shown = showTab(state, source, owner.id, tab.id);

  if (tab.focusedPaneId !== id) {
    changes.push({ type: 'paneFocused', tabId: tab.id, paneId: id });
  }

  changes.push(...viewChanges(state, shown));

  const keepsZoom = tab.zoomedPaneId === undefined || tab.zoomedPaneId === id;
  const zoomedPaneId = keepsZoom ? tab.zoomedPaneId : undefined;

  if (!keepsZoom) {
    changes.push(...unzoomChanges(tab));
  }

  const tabs = state.tabs.map((known) =>
    known.id === tab.id ? { ...known, focusedPaneId: id, zoomedPaneId } : known,
  );

  const focused: State = { ...shown, tabs };

  if (keepsZoom) {
    return propose(focused, changes);
  }

  const fitted = fitPanes(focused);

  return propose({ ...focused, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

// The pane's area goes to its sibling. The focus moves to the sibling only when the pane had it.
const closePaneIn = (state: State, tab: Tab, id: PaneId): Proposal => {
  const removal = removePane(tab.layout, id);

  if (removal === undefined) {
    return removeTab(state, tab);
  }

  const before = state.stateBeforeSplit.get(id);
  const previous = before?.focusedPaneId;
  const previousStays = previous !== undefined && previous !== id && isInTab(state, previous, tab);
  const successor = previousStays ? previous : firstPaneId(removal.sibling);
  const focusedPaneId = tab.focusedPaneId === id ? successor : tab.focusedPaneId;
  const zoomedPaneId = restoredZoom(state, tab, id, focusedPaneId);
  const closedTab: Tab = { ...tab, layout: removal.layout, focusedPaneId, zoomedPaneId };
  const stateBeforeSplit = new Map(state.stateBeforeSplit);

  stateBeforeSplit.delete(id);

  const closed: State = {
    ...state,
    stateBeforeSplit,
    tabs: state.tabs.map((known) => (known.id === tab.id ? closedTab : known)),
    panes: state.panes.filter((pane) => pane.id !== id),
  };

  const changes: Change[] = [
    { type: 'paneRemoved', paneId: id },
    { type: 'tabLayoutChanged', tabId: tab.id, layout: removal.layout },
  ];

  if (focusedPaneId !== tab.focusedPaneId) {
    changes.push({ type: 'paneFocused', tabId: tab.id, paneId: focusedPaneId });
  }

  if (zoomedPaneId !== tab.zoomedPaneId) {
    changes.push({ type: 'tabZoomChanged', tabId: tab.id, zoomedPaneId });
  }

  const fitted = fitPanes(closed);

  return propose({ ...closed, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

export const closePane = (state: State, id: PaneId): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return refuse('unknownPane');
  }

  return closePaneIn(state, tab, id);
};

export const zoomPane = (state: State, id: PaneId): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return refuse('unknownPane');
  }

  if (tab.layout.kind === 'pane') {
    return propose(state, []);
  }

  const zoomedPaneId = tab.zoomedPaneId === id ? undefined : id;
  const changes: Change[] = [{ type: 'tabZoomChanged', tabId: tab.id, zoomedPaneId }];

  if (tab.focusedPaneId !== id) {
    changes.push({ type: 'paneFocused', tabId: tab.id, paneId: id });
  }

  const zoomedTab: Tab = { ...tab, focusedPaneId: id, zoomedPaneId };

  const zoomed: State = {
    ...state,
    tabs: state.tabs.map((known) => (known.id === tab.id ? zoomedTab : known)),
  };

  const fitted = fitPanes(zoomed);

  return propose({ ...zoomed, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

export const resizePane = (state: State, intent: ResizePaneIntent): Outcome => {
  const { paneId: id, direction, cells } = intent;

  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return refuse('unknownPane');
  }

  const layout = resizeLayout(tab.layout, id, direction, cells, state.layoutArea);

  if (layout === undefined) {
    return refuse('noSplit');
  }

  const changes = unzoomChanges(tab);

  if (layout !== tab.layout) {
    changes.push({ type: 'tabLayoutChanged', tabId: tab.id, layout });
  }

  const resizedTab: Tab = { ...tab, layout, zoomedPaneId: undefined };

  const resized: State = {
    ...state,
    tabs: state.tabs.map((known) => (known.id === tab.id ? resizedTab : known)),
  };

  const fitted = fitPanes(resized);

  return propose({ ...resized, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

const endPane = (
  state: State,
  pane: Pane,
  exitCode: number | undefined,
  restore?: StartFallback,
): Proposal => {
  if (state.stopping) {
    const exited = { ...pane, lifecycle: 'exited' as const, exitCode };

    return propose({ ...state, panes: replacePane(state, exited) }, [
      {
        type: 'paneStateChanged',
        paneId: pane.id,
        lifecycle: 'exited',
        exitCode,
        error: undefined,
      },
    ]);
  }

  const tab = state.tabs.find((known) => known.id === pane.tabId);

  invariant(tab !== undefined, `Pane ${pane.id} has no tab.`);

  if (removePane(tab.layout, pane.id) === undefined) {
    return removeTab(state, tab, restore);
  }

  return closePaneIn(state, tab, pane.id);
};

const markFailed = (state: State, pane: Pane, message: string): Proposal =>
  propose(
    { ...state, panes: replacePane(state, { ...pane, lifecycle: 'failed', error: message }) },
    [
      {
        type: 'paneStateChanged',
        paneId: pane.id,
        lifecycle: 'failed',
        exitCode: undefined,
        error: message,
      },
    ],
  );

const markRunning = (state: State, pane: Pane): Proposal => {
  const stateBeforeSplit = new Map(state.stateBeforeSplit);

  stateBeforeSplit.delete(pane.id);

  const next: State = {
    ...state,
    stateBeforeSplit,
    panes: replacePane(state, { ...pane, lifecycle: 'running' }),
    startFallbacks: state.startFallbacks.filter((known) => known.paneId !== pane.id),
  };

  return propose(next, [
    {
      type: 'paneStateChanged',
      paneId: pane.id,
      lifecycle: 'running',
      exitCode: undefined,
      error: undefined,
    },
  ]);
};

// Returns nothing when the fact leaves the state unchanged.
export const transitionPaneFact = (state: State, pane: Pane, fact: Fact): Proposal | undefined => {
  // The effect that runs a pane generation reports its end once.
  invariant(pane.lifecycle !== 'exited', `Pane ${pane.id} reported ${fact.type} after it exited.`);

  const restore = state.startFallbacks.find((known) => known.paneId === pane.id);

  const settled = {
    ...state,
    startFallbacks: state.startFallbacks.filter((known) => known.paneId !== pane.id),
  };

  if (fact.type === 'paneExited') {
    return endPane(settled, pane, fact.exitCode);
  }

  if (fact.type === 'paneFailedToStart' && pane.restored && !state.stopping) {
    return markFailed(settled, pane, fact.message);
  }

  if (fact.type === 'paneFailedToStart') {
    return endPane(settled, pane, undefined, restore);
  }

  return pane.lifecycle === 'starting' ? markRunning(state, pane) : undefined;
};
