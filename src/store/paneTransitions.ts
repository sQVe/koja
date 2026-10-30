import { paneId } from '../ids.ts';
import type { ClientId, PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import {
  arrangementForLayout,
  canSplit,
  firstPaneId,
  layoutPanes,
  removePane,
  resizeLayout,
  splitLayout,
  tabPanes,
} from '../layout.ts';
import type { Layout, TerminalSize } from '../layout.ts';
import { fitPanes, lonePaneSize } from './paneSizes.ts';
import { withoutStartupRecords } from './paneStartupRecords.ts';
import { withoutPiRecords } from './piRecoveryRecords.ts';
import type { Change, Fact, Intent, Pane, StartFallback, State, Tab } from './store.ts';
import { masterPlacement } from './tabLayoutTransitions.ts';
import { removeTab, showTab } from './tabTransitions.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome, Proposal } from './transitionOutcome.ts';
import { viewChanges } from './view.ts';

type SplitPaneIntent = Extract<Intent, { type: 'splitPane' }>;
type ResizePaneIntent = Extract<Intent, { type: 'resizePane' }>;
type AddPaneIntent = Extract<Intent, { type: 'addPane' }>;

export const unzoomChanges = (tab: Tab): Change[] =>
  tab.zoomedPaneId === undefined
    ? []
    : [{ type: 'tabZoomChanged', tabId: tab.id, zoomedPaneId: undefined }];

const isInTab = (state: State, id: PaneId, tab: Tab): boolean =>
  state.panes.some((pane) => pane.id === id && pane.tabId === tab.id);

// The zoomed pane must stay the focused pane, so the zoom comes back only with its focus.
const restoredZoom = (state: State, id: PaneId, focusedPaneId: PaneId): PaneId | undefined => {
  const zoomed = state.stateBeforeSplit.get(id)?.zoomedPaneId;

  return zoomed === focusedPaneId ? zoomed : undefined;
};

const replacePane = (state: State, replacement: Pane): readonly Pane[] =>
  state.panes.map((pane) => (pane.id === replacement.id ? replacement : pane));

const addedPaneSize = (state: State, tab: Tab, id: PaneId): TerminalSize => {
  const placed = tabPanes(tab, state.layoutArea);
  const rectangle = placed.ok ? placed.panes.find((known) => known.paneId === id) : undefined;

  return rectangle === undefined
    ? lonePaneSize(state, id)
    : { columns: rectangle.terminal.columns, rows: rectangle.terminal.rows };
};

const addPaneIn = (
  state: State,
  tab: Tab,
  placement: Pick<Tab, 'layout' | 'arrangement'>,
  folder: string | undefined,
): Proposal => {
  const { layout, arrangement } = placement;
  const addedId = paneId(state.nextPaneNumber);
  const zoomedPaneId = tab.zoomedPaneId === undefined ? undefined : addedId;

  const addedTab: Tab = {
    ...tab,
    layout,
    arrangement,
    focusedPaneId: addedId,
    zoomedPaneId,
  };

  const added: Pane = {
    id: addedId,
    tabId: tab.id,
    lifecycle: 'starting',
    size: addedPaneSize(state, addedTab, addedId),
    generation: state.nextGeneration,
    exitCode: undefined,
    startFolder: folder,
    restored: false,
    error: undefined,
  };

  const next: State = {
    ...state,
    tabs: state.tabs.map((known) => (known.id === tab.id ? addedTab : known)),
    panes: [...state.panes, added],
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
    stateBeforeSplit: new Map(state.stateBeforeSplit).set(added.id, {
      focusedPaneId: tab.focusedPaneId,
      zoomedPaneId: tab.zoomedPaneId,
    }),
  };

  const fitted = fitPanes(next);

  const zoomChanges: Change[] =
    zoomedPaneId === undefined ? [] : [{ type: 'tabZoomChanged', tabId: tab.id, zoomedPaneId }];

  return propose({ ...next, panes: fitted.panes }, [
    { type: 'paneAdded', pane: added },
    { type: 'tabLayoutChanged', tabId: tab.id, layout, arrangement },
    { type: 'paneFocused', tabId: tab.id, paneId: added.id },
    ...zoomChanges,
    ...fitted.changes,
  ]);
};

const isMaster = (tab: Tab): boolean => tab.arrangement.choice === 'master';

export const splitPane = (state: State, intent: SplitPaneIntent): Outcome => {
  const { paneId: id, direction, folder } = intent;

  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (tab === undefined) {
    return refuse('unknownPane');
  }

  if (isMaster(tab)) {
    return refuse('requiresLegacyLayout');
  }

  const rectangle = layoutPanes(tab.layout, state.layoutArea).find(
    (placed) => placed.paneId === id,
  );

  if (rectangle === undefined || !canSplit(rectangle, direction)) {
    return refuse('paneTooSmall');
  }

  const layout = splitLayout(tab.layout, id, direction, paneId(state.nextPaneNumber));
  const arrangement = arrangementForLayout(tab.arrangement, layout);

  return addPaneIn(state, tab, { layout, arrangement }, folder);
};

export const addPane = (state: State, intent: AddPaneIntent): Outcome => {
  const { paneId: id, folder } = intent;

  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (tab === undefined) {
    return refuse('unknownPane');
  }

  if (!isMaster(tab)) {
    return splitPane(state, { type: 'splitPane', paneId: id, direction: 'right', folder });
  }

  return addPaneIn(state, tab, masterPlacement(tab, paneId(state.nextPaneNumber)), folder);
};

export const focusPane = (state: State, id: PaneId, source: ClientId | undefined): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (tab === undefined) {
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

  const zoomedPaneId = tab.zoomedPaneId === undefined ? undefined : id;

  const tabs = state.tabs.map((known) =>
    known.id === tab.id ? { ...known, focusedPaneId: id, zoomedPaneId } : known,
  );

  const focused: State = { ...shown, tabs };

  if (zoomedPaneId === tab.zoomedPaneId) {
    return propose(focused, changes);
  }

  changes.push({ type: 'tabZoomChanged', tabId: tab.id, zoomedPaneId });

  const fitted = fitPanes(focused);

  return propose({ ...focused, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

// The pane that takes the closed pane's place in the order gets the focus. The last pane hands it
// to its predecessor.
const masterSuccessor = (
  before: readonly PaneId[],
  id: PaneId,
  after: readonly PaneId[],
): PaneId => {
  const index = before.indexOf(id);
  const successor = after[index] ?? after[index - 1];

  invariant(successor !== undefined, `Pane ${id} has no successor in its master tab.`);

  return successor;
};

const legacySuccessor = (state: State, tab: Tab, id: PaneId, sibling: Layout): PaneId => {
  const previous = state.stateBeforeSplit.get(id)?.focusedPaneId;
  const previousStays = previous !== undefined && previous !== id && isInTab(state, previous, tab);

  return previousStays ? previous : firstPaneId(sibling);
};

// The pane's area goes to its sibling. The focus moves to the successor only when the pane had it.
const closePaneIn = (state: State, tab: Tab, id: PaneId): Proposal => {
  const removal = removePane(tab.layout, id);

  if (removal === undefined) {
    return removeTab(state, tab, undefined, true);
  }

  const { layout } = removal;
  const arrangement = arrangementForLayout(tab.arrangement, layout);

  const successor = isMaster(tab)
    ? masterSuccessor(tab.arrangement.order, id, arrangement.order)
    : legacySuccessor(state, tab, id, removal.sibling);

  const focusedPaneId = tab.focusedPaneId === id ? successor : tab.focusedPaneId;

  const zoomedPaneId =
    tab.zoomedPaneId === undefined ? restoredZoom(state, id, focusedPaneId) : focusedPaneId;

  const closedTab: Tab = { ...tab, layout, arrangement, focusedPaneId, zoomedPaneId };

  const closed: State = {
    ...withoutPiRecords(withoutStartupRecords(state, [id]), [id]),
    tabs: state.tabs.map((known) => (known.id === tab.id ? closedTab : known)),
    panes: state.panes.filter((pane) => pane.id !== id),
  };

  const changes: Change[] = [
    { type: 'paneRemoved', paneId: id },
    { type: 'tabLayoutChanged', tabId: tab.id, layout, arrangement },
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

  if (tab === undefined) {
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

  if (tab === undefined) {
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

  if (tab === undefined) {
    return refuse('unknownPane');
  }

  if (isMaster(tab)) {
    return refuse('requiresLegacyLayout');
  }

  const layout = resizeLayout(tab.layout, id, direction, cells, state.layoutArea);

  if (layout === undefined) {
    return refuse('noSplit');
  }

  const changes = unzoomChanges(tab);

  if (layout !== tab.layout) {
    changes.push({ type: 'tabLayoutChanged', tabId: tab.id, layout, arrangement: tab.arrangement });
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
    return removeTab(state, tab, restore, restore === undefined);
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
  const next: State = {
    ...withoutStartupRecords(state, [pane.id]),
    panes: replacePane(state, { ...pane, lifecycle: 'running' }),
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

  if (fact.type === 'paneFailed' && !state.stopping) {
    return markFailed(settled, pane, fact.message);
  }

  if (fact.type === 'paneFailed') {
    return endPane(settled, pane, undefined, restore);
  }

  if (fact.type === 'paneFailedToStart' && pane.restored && !state.stopping) {
    return markFailed(settled, pane, fact.message);
  }

  if (fact.type === 'paneFailedToStart') {
    return endPane(settled, pane, undefined, restore);
  }

  return pane.lifecycle === 'starting' ? markRunning(state, pane) : undefined;
};
