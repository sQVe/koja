import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import {
  canSplit,
  firstPaneId,
  layoutPanes,
  paneSize,
  removePane,
  splitLayout,
} from '../layout.ts';
import type { Layout, SplitDirection, TerminalSize } from '../layout.ts';

type PaneLifecycle = 'starting' | 'running' | 'exited' | 'closing';

export interface Workspace {
  id: WorkspaceId;
  // The directory its panes start in.
  root: string;
  label: string;
  tabIds: readonly TabId[];
  activeTabId: TabId;
}

export interface Tab {
  id: TabId;
  workspaceId: WorkspaceId;
  layout: Layout;
  focusedPaneId: PaneId;
  zoomedPaneId: PaneId | undefined;
}

export interface Pane {
  id: PaneId;
  tabId: TabId;
  lifecycle: PaneLifecycle;
  size: TerminalSize;
  generation: number;
  exitCode: number | undefined;
}

// Colors as 0xRRGGBB numbers.
export interface Theme {
  foreground: number;
  background: number;
  // Palette indexes 0-15.
  palette: readonly number[];
}

export interface Client {
  id: ClientId;
  size: TerminalSize;
  // Absent until the client reports the colors of its terminal.
  theme: Theme | undefined;
}

export interface State {
  workspaces: readonly Workspace[];
  tabs: readonly Tab[];
  panes: readonly Pane[];
  focusedWorkspaceId: WorkspaceId | undefined;
  attachedClientId: ClientId | undefined;
  clients: readonly Client[];
  stopping: boolean;
  nextWorkspaceNumber: number;
  nextTabNumber: number;
  nextPaneNumber: number;
  nextClientNumber: number;
  nextGeneration: number;
  // What a new tab or workspace replaced as active, until its pane starts.
  startFallbacks: readonly StartFallback[];
  // The layout area of the attached client, kept after it detaches.
  layoutArea: TerminalSize;
  // For each split pane that has not started yet, the pane that had the focus before the split.
  focusBeforeSplit: ReadonlyMap<PaneId, PaneId>;
  revision: number;
}

interface StartFallback {
  paneId: PaneId;
  tabId: TabId | undefined;
  workspaceId: WorkspaceId | undefined;
}

export type Intent =
  | { type: 'createWorkspace'; root: string; label: string | undefined; background: boolean }
  | { type: 'focusWorkspace'; workspaceId: WorkspaceId }
  | { type: 'renameWorkspace'; workspaceId: WorkspaceId; label: string }
  | { type: 'closeWorkspace'; workspaceId: WorkspaceId }
  | { type: 'createTab'; workspaceId: WorkspaceId }
  | { type: 'focusTab'; tabId: TabId }
  | { type: 'closeTab'; tabId: TabId }
  | { type: 'splitPane'; paneId: PaneId; direction: SplitDirection }
  | { type: 'focusPane'; paneId: PaneId }
  | { type: 'closePane'; paneId: PaneId }
  | { type: 'attachClient'; size: TerminalSize }
  | { type: 'resizeClient'; clientId: ClientId; size: TerminalSize }
  | { type: 'setClientTheme'; clientId: ClientId; theme: Theme }
  | { type: 'detachClient'; clientId: ClientId }
  | { type: 'stopServer' };

export type Fact =
  | { type: 'paneStarted'; paneId: PaneId; generation: number }
  | { type: 'paneFailedToStart'; paneId: PaneId; generation: number }
  | { type: 'paneExited'; paneId: PaneId; generation: number; exitCode: number };

export type DetachReason = 'requested' | 'takenOver';

export type Change =
  // Carries the focus that results, because a background create keeps the current focus.
  | { type: 'workspaceAdded'; workspace: Workspace; focusedWorkspaceId: WorkspaceId }
  | { type: 'tabAdded'; tab: Tab }
  | { type: 'paneAdded'; pane: Pane }
  | { type: 'workspaceFocused'; workspaceId: WorkspaceId }
  | { type: 'workspaceRenamed'; workspaceId: WorkspaceId; label: string }
  | { type: 'tabFocused'; workspaceId: WorkspaceId; tabId: TabId }
  // Carries the focus that remains, so a client needs no rule to pick it.
  | {
      type: 'workspaceRemoved';
      workspaceId: WorkspaceId;
      focusedWorkspaceId: WorkspaceId | undefined;
    }
  | { type: 'tabRemoved'; tabId: TabId }
  | { type: 'paneRemoved'; paneId: PaneId }
  | { type: 'tabLayoutChanged'; tabId: TabId; layout: Layout }
  | { type: 'paneFocused'; tabId: TabId; paneId: PaneId }
  | {
      type: 'paneStateChanged';
      paneId: PaneId;
      lifecycle: PaneLifecycle;
      exitCode: number | undefined;
    }
  | { type: 'paneResized'; paneId: PaneId; size: TerminalSize }
  | { type: 'clientAttached'; client: Client }
  | { type: 'clientResized'; clientId: ClientId; size: TerminalSize }
  | { type: 'clientThemeChanged'; clientId: ClientId; theme: Theme }
  | { type: 'clientDetached'; clientId: ClientId; reason: DetachReason }
  | { type: 'serverStopping' };

type TabIntent = Extract<Intent, { type: 'createTab' | 'focusTab' | 'closeTab' }>;

type PaneIntent = Extract<Intent, { type: 'splitPane' | 'focusPane' | 'closePane' }>;

type RejectReason =
  | 'serverStopping'
  | 'unknownClient'
  | 'unknownWorkspace'
  | 'unknownTab'
  | 'unknownPane'
  | 'paneTooSmall';

// Whatever an effect still holds for this pane generation, such as its process and PTY.
interface PaneProcess {
  paneId: PaneId;
  generation: number;
}

export interface Applied {
  kind: 'applied';
  state: State;
  changes: readonly Change[];
}

export interface Rejected {
  kind: 'rejected';
  state: State;
  reason: RejectReason;
}

export interface Ignored {
  kind: 'ignored';
  state: State;
  dispose: PaneProcess;
}

export interface Snapshot {
  revision: number;
  workspaces: readonly Workspace[];
  tabs: readonly Tab[];
  panes: readonly Pane[];
  focusedWorkspaceId: WorkspaceId | undefined;
  attachedClientId: ClientId | undefined;
  clients: readonly Client[];
}

export const createState = (): State => ({
  workspaces: [],
  tabs: [],
  panes: [],
  focusedWorkspaceId: undefined,
  attachedClientId: undefined,
  clients: [],
  stopping: false,
  nextWorkspaceNumber: 1,
  nextTabNumber: 1,
  nextPaneNumber: 1,
  nextClientNumber: 1,
  nextGeneration: 1,
  startFallbacks: [],
  layoutArea: paneSize(undefined),
  focusBeforeSplit: new Map(),
  revision: 0,
});

export const snapshot = (state: State): Snapshot => ({
  revision: state.revision,
  workspaces: state.workspaces,
  tabs: state.tabs,
  panes: state.panes,
  focusedWorkspaceId: state.focusedWorkspaceId,
  attachedClientId: state.attachedClientId,
  clients: state.clients,
});

const commit = (state: State, changes: readonly Change[]): Applied => {
  const revision = state.revision + changes.length;

  return { kind: 'applied', state: { ...state, revision }, changes };
};

const reject = (state: State, reason: RejectReason): Rejected => ({
  kind: 'rejected',
  state,
  reason,
});

const sameSize = (left: TerminalSize, right: TerminalSize): boolean =>
  left.columns === right.columns && left.rows === right.rows;

const isLive = (pane: Pane): boolean =>
  pane.lifecycle === 'starting' || pane.lifecycle === 'running';

const attachedClientOf = (state: State): Client | undefined =>
  state.clients.find((client) => client.id === state.attachedClientId);

export const focusedPane = (
  state: Pick<Snapshot, 'workspaces' | 'tabs' | 'panes' | 'focusedWorkspaceId'>,
): Pane | undefined => {
  const workspace = state.workspaces.find((known) => known.id === state.focusedWorkspaceId);
  const tab = state.tabs.find((known) => known.id === workspace?.activeTabId);

  return state.panes.find((known) => known.id === tab?.focusedPaneId);
};

// The colors the pane's terminal answers with: those of the attached client, once it reported them.
export const paneTheme = (state: State): Theme | undefined => attachedClientOf(state)?.theme;

const sameTheme = (left: Theme | undefined, right: Theme): boolean =>
  left?.foreground === right.foreground &&
  left.background === right.background &&
  left.palette.every((color, index) => color === right.palette[index]);

const fitPanesTo = (
  state: State,
  area: TerminalSize,
): { panes: readonly Pane[]; changes: Change[] } => {
  const sizes = new Map<PaneId, TerminalSize>();

  for (const tab of state.tabs) {
    for (const { paneId: id, columns, rows } of layoutPanes(tab.layout, area)) {
      sizes.set(id, { columns, rows });
    }
  }

  const changes: Change[] = [];

  const panes = state.panes.map((pane) => {
    const size = sizes.get(pane.id);

    if (size === undefined || !isLive(pane) || sameSize(size, pane.size)) {
      return pane;
    }

    changes.push({ type: 'paneResized', paneId: pane.id, size });

    return { ...pane, size };
  });

  return { panes, changes };
};

const fitPanes = (state: State): { panes: readonly Pane[]; changes: Change[] } =>
  fitPanesTo(state, state.layoutArea);

const defaultLabel = (root: string): string => {
  const trimmed = root.replace(/\/+$/, '');
  const baseName = trimmed.slice(trimmed.lastIndexOf('/') + 1);

  return baseName === '' ? root : baseName;
};

const createWorkspace = (
  state: State,
  root: string,
  label: string | undefined,
  background: boolean,
): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const pane: Pane = {
    id: paneId(state.nextPaneNumber),
    tabId: tabId(state.nextTabNumber),
    lifecycle: 'starting',
    size: state.layoutArea,
    generation: state.nextGeneration,
    exitCode: undefined,
  };

  const tab: Tab = {
    id: pane.tabId,
    workspaceId: workspaceId(state.nextWorkspaceNumber),
    layout: { kind: 'pane', paneId: pane.id },
    focusedPaneId: pane.id,
    zoomedPaneId: undefined,
  };

  const workspace: Workspace = {
    id: tab.workspaceId,
    root,
    label: label ?? defaultLabel(root),
    tabIds: [tab.id],
    activeTabId: tab.id,
  };

  const keepsFocus = background && state.focusedWorkspaceId !== undefined;

  const focusedWorkspaceId =
    keepsFocus && state.focusedWorkspaceId !== undefined ? state.focusedWorkspaceId : workspace.id;

  const next: State = {
    ...state,
    workspaces: [...state.workspaces, workspace],
    tabs: [...state.tabs, tab],
    panes: [...state.panes, pane],
    focusedWorkspaceId,
    startFallbacks: [
      ...state.startFallbacks,
      { paneId: pane.id, tabId: undefined, workspaceId: state.focusedWorkspaceId },
    ],
    nextWorkspaceNumber: state.nextWorkspaceNumber + 1,
    nextTabNumber: state.nextTabNumber + 1,
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
  };

  return commit(next, [
    { type: 'workspaceAdded', workspace, focusedWorkspaceId },
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
  ]);
};

const focusWorkspace = (state: State, id: WorkspaceId): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  if (!state.workspaces.some((workspace) => workspace.id === id)) {
    return reject(state, 'unknownWorkspace');
  }

  if (state.focusedWorkspaceId === id) {
    return commit(state, []);
  }

  return commit({ ...state, focusedWorkspaceId: id }, [
    { type: 'workspaceFocused', workspaceId: id },
  ]);
};

const renameWorkspace = (state: State, id: WorkspaceId, label: string): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const renaming = state.workspaces.find((workspace) => workspace.id === id);

  if (renaming === undefined) {
    return reject(state, 'unknownWorkspace');
  }

  if (renaming.label === label) {
    return commit(state, []);
  }

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === id ? { ...workspace, label } : workspace,
  );

  return commit({ ...state, workspaces }, [{ type: 'workspaceRenamed', workspaceId: id, label }]);
};

// The next workspace in list order takes the focus, or the previous one when it was last.
const focusAfterRemoval = (
  state: State,
  removedId: WorkspaceId,
  restore: WorkspaceId | undefined,
): WorkspaceId | undefined => {
  if (state.focusedWorkspaceId !== removedId) {
    return state.focusedWorkspaceId;
  }

  if (state.workspaces.some((workspace) => workspace.id === restore)) {
    return restore;
  }

  const index = state.workspaces.findIndex((workspace) => workspace.id === removedId);
  const neighbor = state.workspaces[index + 1] ?? state.workspaces[index - 1];

  return neighbor?.id;
};

// The next tab in list order becomes active, or the previous one when it was last.
const activeAfterRemoval = (
  owner: Workspace,
  removedId: TabId,
  restore: TabId | undefined,
): TabId | undefined => {
  if (owner.activeTabId !== removedId) {
    return owner.activeTabId;
  }

  if (restore !== undefined && owner.tabIds.includes(restore)) {
    return restore;
  }

  const index = owner.tabIds.indexOf(removedId);

  return owner.tabIds[index + 1] ?? owner.tabIds[index - 1];
};

const removeTab = (state: State, tab: Tab, restore?: StartFallback): Applied => {
  const remaining = state.panes.filter((pane) => pane.tabId !== tab.id);
  const removedPanes = state.panes.filter((pane) => pane.tabId === tab.id);
  const changes: Change[] = removedPanes.map((pane) => ({ type: 'paneRemoved', paneId: pane.id }));

  changes.push({ type: 'tabRemoved', tabId: tab.id });

  const tabs = state.tabs.filter((known) => known.id !== tab.id);
  const owner = state.workspaces.find((workspace) => workspace.id === tab.workspaceId);
  const tabIds = owner?.tabIds.filter((id) => id !== tab.id) ?? [];
  let next: State = { ...state, panes: remaining, tabs };

  if (owner === undefined) {
    return commit(next, changes);
  }

  if (tabIds.length > 0) {
    const activeTabId = activeAfterRemoval(owner, tab.id, restore?.tabId);

    invariant(activeTabId !== undefined, `Workspace ${owner.id} has no tab to activate.`);

    if (activeTabId !== owner.activeTabId) {
      changes.push({ type: 'tabFocused', workspaceId: owner.id, tabId: activeTabId });
    }

    const workspaces = state.workspaces.map((workspace) =>
      workspace.id === owner.id ? { ...workspace, tabIds, activeTabId } : workspace,
    );

    next = { ...next, workspaces };

    return commit(next, changes);
  }

  const focusedWorkspaceId = focusAfterRemoval(state, owner.id, restore?.workspaceId);

  changes.push({ type: 'workspaceRemoved', workspaceId: owner.id, focusedWorkspaceId });

  const workspaces = state.workspaces.filter((workspace) => workspace.id !== owner.id);

  return commit({ ...next, workspaces, focusedWorkspaceId }, changes);
};

const createTab = (state: State, id: WorkspaceId): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const owner = state.workspaces.find((workspace) => workspace.id === id);

  if (owner === undefined) {
    return reject(state, 'unknownWorkspace');
  }

  const pane: Pane = {
    id: paneId(state.nextPaneNumber),
    tabId: tabId(state.nextTabNumber),
    lifecycle: 'starting',
    size: state.layoutArea,
    generation: state.nextGeneration,
    exitCode: undefined,
  };

  const tab: Tab = {
    id: pane.tabId,
    workspaceId: id,
    layout: { kind: 'pane', paneId: pane.id },
    focusedPaneId: pane.id,
    zoomedPaneId: undefined,
  };

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === id
      ? { ...workspace, tabIds: [...workspace.tabIds, tab.id], activeTabId: tab.id }
      : workspace,
  );

  const next: State = {
    ...state,
    workspaces,
    tabs: [...state.tabs, tab],
    panes: [...state.panes, pane],
    startFallbacks: [
      ...state.startFallbacks,
      { paneId: pane.id, tabId: owner.activeTabId, workspaceId: undefined },
    ],
    nextTabNumber: state.nextTabNumber + 1,
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
  };

  return commit(next, [
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
    { type: 'tabFocused', workspaceId: id, tabId: tab.id },
  ]);
};

const focusTab = (state: State, id: TabId): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const tab = state.tabs.find((known) => known.id === id);

  if (tab === undefined) {
    return reject(state, 'unknownTab');
  }

  const owner = state.workspaces.find((workspace) => workspace.id === tab.workspaceId);

  invariant(owner !== undefined, `Tab ${id} has no workspace.`);

  const changes: Change[] = [];

  if (owner.activeTabId !== id) {
    changes.push({ type: 'tabFocused', workspaceId: owner.id, tabId: id });
  }

  if (state.focusedWorkspaceId !== owner.id) {
    changes.push({ type: 'workspaceFocused', workspaceId: owner.id });
  }

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === owner.id ? { ...workspace, activeTabId: id } : workspace,
  );

  return commit({ ...state, workspaces, focusedWorkspaceId: owner.id }, changes);
};

const closeTab = (state: State, id: TabId): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const tab = state.tabs.find((known) => known.id === id);

  if (tab === undefined) {
    return reject(state, 'unknownTab');
  }

  return removeTab(state, tab);
};

const closeWorkspace = (state: State, id: WorkspaceId): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const closing = state.workspaces.find((workspace) => workspace.id === id);

  if (closing === undefined) {
    return reject(state, 'unknownWorkspace');
  }

  let current: State = state;
  const changes: Change[] = [];

  for (const tab of state.tabs.filter((known) => known.workspaceId === id)) {
    const removed = removeTab(current, tab);

    current = removed.state;
    changes.push(...removed.changes.filter((change) => change.type !== 'tabFocused'));
  }

  return commit({ ...current, revision: state.revision }, changes);
};

const splitPane = (state: State, id: PaneId, direction: SplitDirection): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return reject(state, 'unknownPane');
  }

  const area = state.layoutArea;
  const rectangle = layoutPanes(tab.layout, area).find((placed) => placed.paneId === id);

  if (rectangle === undefined || !canSplit(rectangle, direction)) {
    return reject(state, 'paneTooSmall');
  }

  const addedId = paneId(state.nextPaneNumber);
  const layout = splitLayout(tab.layout, id, direction, addedId);
  const addedRectangle = layoutPanes(layout, area).find((placed) => placed.paneId === addedId);

  invariant(addedRectangle !== undefined, `Split layout has no pane ${addedId}.`);

  const added: Pane = {
    id: addedId,
    tabId: tab.id,
    lifecycle: 'starting',
    size: { columns: addedRectangle.columns, rows: addedRectangle.rows },
    generation: state.nextGeneration,
    exitCode: undefined,
  };

  const splitTab: Tab = { ...tab, layout, focusedPaneId: added.id };

  const split: State = {
    ...state,
    tabs: state.tabs.map((known) => (known.id === tab.id ? splitTab : known)),
    panes: [...state.panes, added],
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
    focusBeforeSplit: new Map(state.focusBeforeSplit).set(added.id, tab.focusedPaneId),
  };

  const fitted = fitPanesTo(split, area);

  return commit({ ...split, panes: fitted.panes }, [
    { type: 'paneAdded', pane: added },
    { type: 'tabLayoutChanged', tabId: tab.id, layout },
    { type: 'paneFocused', tabId: tab.id, paneId: added.id },
    ...fitted.changes,
  ]);
};

const focusPane = (state: State, id: PaneId): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return reject(state, 'unknownPane');
  }

  if (tab.focusedPaneId === id) {
    return commit(state, []);
  }

  const tabs = state.tabs.map((known) =>
    known.id === tab.id ? { ...known, focusedPaneId: id } : known,
  );

  return commit({ ...state, tabs }, [{ type: 'paneFocused', tabId: tab.id, paneId: id }]);
};

const isInTab = (state: State, id: PaneId, tab: Tab): boolean =>
  state.panes.some((pane) => pane.id === id && pane.tabId === tab.id);

// The pane's area goes to its sibling. The focus moves to the sibling only when the pane had it.
const closePaneIn = (state: State, tab: Tab, id: PaneId): Applied => {
  const removal = removePane(tab.layout, id);

  if (removal === undefined) {
    return removeTab(state, tab);
  }

  const previous = state.focusBeforeSplit.get(id);
  const previousStays = previous !== undefined && previous !== id && isInTab(state, previous, tab);
  const successor = previousStays ? previous : firstPaneId(removal.sibling);
  const focusedPaneId = tab.focusedPaneId === id ? successor : tab.focusedPaneId;
  const closedTab: Tab = { ...tab, layout: removal.layout, focusedPaneId };
  const focusBeforeSplit = new Map(state.focusBeforeSplit);

  focusBeforeSplit.delete(id);

  const closed: State = {
    ...state,
    focusBeforeSplit,
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

  const fitted = fitPanes(closed);

  return commit({ ...closed, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

const closePane = (state: State, id: PaneId): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return reject(state, 'unknownPane');
  }

  return closePaneIn(state, tab, id);
};

const attachClient = (state: State, size: TerminalSize): Applied => {
  const client: Client = { id: clientId(state.nextClientNumber), size, theme: undefined };
  const previous = state.attachedClientId;
  const changes: Change[] = [];

  if (previous !== undefined) {
    changes.push({ type: 'clientDetached', clientId: previous, reason: 'takenOver' });
  }

  changes.push({ type: 'clientAttached', client });

  const attached: State = {
    ...state,
    attachedClientId: client.id,
    clients: [...state.clients.filter((known) => known.id !== previous), client],
    nextClientNumber: state.nextClientNumber + 1,
    layoutArea: paneSize(size),
  };

  const fitted = fitPanes(attached);

  return commit({ ...attached, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

const resizeClient = (state: State, id: ClientId, size: TerminalSize): Applied | Rejected => {
  const resizing = state.clients.find((known) => known.id === id);

  if (resizing === undefined) {
    return reject(state, 'unknownClient');
  }

  if (sameSize(resizing.size, size)) {
    return commit(state, []);
  }

  const resized: State = {
    ...state,
    clients: state.clients.map((client) => (client.id === id ? { ...client, size } : client)),
    layoutArea: paneSize(size),
  };

  const fitted = fitPanes(resized);

  return commit({ ...resized, panes: fitted.panes }, [
    { type: 'clientResized', clientId: id, size },
    ...fitted.changes,
  ]);
};

const setClientTheme = (state: State, id: ClientId, theme: Theme): Applied | Rejected => {
  const reporting = state.clients.find((known) => known.id === id);

  if (reporting === undefined) {
    return reject(state, 'unknownClient');
  }

  if (sameTheme(reporting.theme, theme)) {
    return commit(state, []);
  }

  const themed: State = {
    ...state,
    clients: state.clients.map((client) => (client.id === id ? { ...client, theme } : client)),
  };

  return commit(themed, [{ type: 'clientThemeChanged', clientId: id, theme }]);
};

// The pane keeps its size after a detach, so the next attach redraws the same screen.
const detachClient = (state: State, id: ClientId): Applied | Rejected => {
  if (!state.clients.some((client) => client.id === id)) {
    return reject(state, 'unknownClient');
  }

  const attachedClientId = state.attachedClientId === id ? undefined : state.attachedClientId;

  const next: State = {
    ...state,
    attachedClientId,
    clients: state.clients.filter((client) => client.id !== id),
  };

  return commit(next, [{ type: 'clientDetached', clientId: id, reason: 'requested' }]);
};

const stopServer = (state: State): Applied => {
  if (state.stopping) {
    return commit(state, []);
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
    });

    return { ...pane, lifecycle: 'closing' as const };
  });

  changes.push({ type: 'serverStopping' });

  return commit({ ...state, panes, stopping: true }, changes);
};

const isTabIntent = (intent: Intent): intent is TabIntent =>
  intent.type === 'createTab' || intent.type === 'focusTab' || intent.type === 'closeTab';

const isPaneIntent = (intent: Intent): intent is PaneIntent =>
  intent.type === 'splitPane' || intent.type === 'focusPane' || intent.type === 'closePane';

const applyTabIntent = (state: State, intent: TabIntent): Applied | Rejected => {
  if (intent.type === 'createTab') {
    return createTab(state, intent.workspaceId);
  }

  return intent.type === 'focusTab' ? focusTab(state, intent.tabId) : closeTab(state, intent.tabId);
};

const applyPaneIntent = (state: State, intent: PaneIntent): Applied | Rejected => {
  if (intent.type === 'splitPane') {
    return splitPane(state, intent.paneId, intent.direction);
  }

  return intent.type === 'focusPane'
    ? focusPane(state, intent.paneId)
    : closePane(state, intent.paneId);
};

export const applyIntent = (state: State, intent: Intent): Applied | Rejected => {
  if (intent.type === 'createWorkspace') {
    return createWorkspace(state, intent.root, intent.label, intent.background);
  }

  if (intent.type === 'focusWorkspace') {
    return focusWorkspace(state, intent.workspaceId);
  }

  if (intent.type === 'renameWorkspace') {
    return renameWorkspace(state, intent.workspaceId, intent.label);
  }

  if (intent.type === 'closeWorkspace') {
    return closeWorkspace(state, intent.workspaceId);
  }

  if (isTabIntent(intent)) {
    return applyTabIntent(state, intent);
  }

  if (isPaneIntent(intent)) {
    return applyPaneIntent(state, intent);
  }

  if (intent.type === 'attachClient') {
    return attachClient(state, intent.size);
  }

  if (intent.type === 'resizeClient') {
    return resizeClient(state, intent.clientId, intent.size);
  }

  if (intent.type === 'setClientTheme') {
    return setClientTheme(state, intent.clientId, intent.theme);
  }

  if (intent.type === 'detachClient') {
    return detachClient(state, intent.clientId);
  }

  return stopServer(state);
};

const ignore = (state: State, fact: Fact): Ignored => ({
  kind: 'ignored',
  state,
  dispose: { paneId: fact.paneId, generation: fact.generation },
});

const isCurrent = (pane: Pane | undefined, fact: Fact): pane is Pane =>
  pane?.id === fact.paneId && pane.generation === fact.generation;

const replacePane = (state: State, replacement: Pane): readonly Pane[] =>
  state.panes.map((pane) => (pane.id === replacement.id ? replacement : pane));

const endPane = (
  state: State,
  pane: Pane,
  exitCode: number | undefined,
  restore?: StartFallback,
): Applied => {
  if (state.stopping) {
    const exited = { ...pane, lifecycle: 'exited' as const, exitCode };

    return commit({ ...state, panes: replacePane(state, exited) }, [
      { type: 'paneStateChanged', paneId: pane.id, lifecycle: 'exited', exitCode },
    ]);
  }

  const tab = state.tabs.find((known) => known.id === pane.tabId);

  invariant(tab !== undefined, `Pane ${pane.id} has no tab.`);

  if (removePane(tab.layout, pane.id) === undefined) {
    return removeTab(state, tab, restore);
  }

  return closePaneIn(state, tab, pane.id);
};

const markRunning = (state: State, pane: Pane): Applied => {
  const focusBeforeSplit = new Map(state.focusBeforeSplit);

  focusBeforeSplit.delete(pane.id);

  const next: State = {
    ...state,
    focusBeforeSplit,
    panes: replacePane(state, { ...pane, lifecycle: 'running' }),
    startFallbacks: state.startFallbacks.filter((known) => known.paneId !== pane.id),
  };

  return commit(next, [
    { type: 'paneStateChanged', paneId: pane.id, lifecycle: 'running', exitCode: undefined },
  ]);
};

export const applyFact = (state: State, fact: Fact): Applied | Ignored => {
  const pane = state.panes.find((known) => known.id === fact.paneId);

  if (!isCurrent(pane, fact)) {
    return ignore(state, fact);
  }

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

  if (fact.type === 'paneFailedToStart') {
    return endPane(settled, pane, undefined, restore);
  }

  return pane.lifecycle === 'starting' ? markRunning(state, pane) : ignore(state, fact);
};
