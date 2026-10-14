import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import {
  canSplit,
  firstPaneId,
  layoutPanes,
  paneSize,
  removePane,
  resizeLayout,
  shownLayout,
  splitLayout,
} from '../layout.ts';
import type { Layout, ResizeDirection, SplitDirection, TerminalSize } from '../layout.ts';

type PaneLifecycle = 'starting' | 'running' | 'exited' | 'closing' | 'failed';

export interface WorkspaceRecord {
  id: WorkspaceId;
  // The directory its panes start in.
  root: string;
  label: string;
  tabIds: readonly TabId[];
}

// A workspace as the session file saves it, with the tab the default view shows.
export interface Workspace extends WorkspaceRecord {
  activeTabId: TabId;
}

interface ActiveTab {
  workspaceId: WorkspaceId;
  tabId: TabId;
}

// What a client shows: the focused workspace and the active tab of every workspace. The focused
// pane and zoom belong to the tab, so every view of a tab shows the same pane focus.
export interface View {
  focusedWorkspaceId: WorkspaceId | undefined;
  activeTabs: readonly ActiveTab[];
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
  // The folder the pane's process starts in. The workspace root is used when it is absent.
  startFolder: string | undefined;
  // True for a pane the restore intent added. Only such a pane stays in the layout when it fails to start.
  restored: boolean;
  // Why a restored pane failed to start. Set only while the lifecycle is failed.
  error: string | undefined;
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
  view: View;
}

interface StateBeforeSplit {
  focusedPaneId: PaneId;
  zoomedPaneId: PaneId | undefined;
}

export interface State {
  workspaces: readonly WorkspaceRecord[];
  tabs: readonly Tab[];
  panes: readonly Pane[];
  // What a new client starts from, what the CLI reads, and what the session file saves.
  defaultView: View;
  attachedClientId: ClientId | undefined;
  // The client whose latest activity is the newest, if any client is attached.
  foregroundClientId: ClientId | undefined;
  clients: readonly Client[];
  // When each client was last active, as a position in a counter. The store reads no clock.
  clientActivity: ReadonlyMap<ClientId, number>;
  nextActivity: number;
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
  // For each split pane that has not started yet, the focus and zoom the tab had before the split.
  stateBeforeSplit: ReadonlyMap<PaneId, StateBeforeSplit>;
  revision: number;
}

// The view of each view owner before a create moved it. The default view has no client id.
interface ViewBefore {
  clientId: ClientId | undefined;
  view: View;
}

interface StartFallback {
  paneId: PaneId;
  views: readonly ViewBefore[];
}

// What survives a restart: structure, layout, focus, and counters. Lifecycle, sizes, and
// generations belong to running panes and start fresh.
export interface SavedSession {
  workspaces: readonly Workspace[];
  tabs: readonly Tab[];
  panes: readonly { id: PaneId; tabId: TabId; startFolder: string | undefined }[];
  focusedWorkspaceId: WorkspaceId | undefined;
  nextWorkspaceNumber: number;
  nextTabNumber: number;
  nextPaneNumber: number;
}

// A focus or create intent from a terminal client carries its id and moves that client's view and
// the default view. Without an id it comes from the CLI and moves every view.
export type Intent =
  | {
      type: 'createWorkspace';
      root: string;
      label: string | undefined;
      background: boolean;
      clientId?: ClientId;
    }
  | { type: 'focusWorkspace'; workspaceId: WorkspaceId; clientId?: ClientId }
  | { type: 'renameWorkspace'; workspaceId: WorkspaceId; label: string }
  | { type: 'closeWorkspace'; workspaceId: WorkspaceId }
  | {
      type: 'createTab';
      workspaceId: WorkspaceId;
      folder: string | undefined;
      clientId?: ClientId;
    }
  | { type: 'focusTab'; tabId: TabId; clientId?: ClientId }
  | { type: 'closeTab'; tabId: TabId }
  | {
      type: 'splitPane';
      paneId: PaneId;
      direction: SplitDirection;
      folder: string | undefined;
    }
  | { type: 'focusPane'; paneId: PaneId; clientId?: ClientId }
  | { type: 'closePane'; paneId: PaneId }
  | { type: 'zoomPane'; paneId: PaneId }
  | { type: 'resizePane'; paneId: PaneId; direction: ResizeDirection; cells: number }
  | { type: 'attachClient'; size: TerminalSize }
  | { type: 'resizeClient'; clientId: ClientId; size: TerminalSize }
  // The client sent input or a request of its own.
  | { type: 'markClientActive'; clientId: ClientId }
  | { type: 'setClientTheme'; clientId: ClientId; theme: Theme }
  | { type: 'detachClient'; clientId: ClientId }
  | { type: 'restoreSession'; session: SavedSession }
  | { type: 'stopServer' };

export type Fact =
  | { type: 'paneStarted'; paneId: PaneId; generation: number }
  | { type: 'paneFailedToStart'; paneId: PaneId; generation: number; message: string }
  | { type: 'paneExited'; paneId: PaneId; generation: number; exitCode: number };

export type DetachReason = 'requested' | 'takenOver';

export type Change =
  // Carries the default focus that results, because a background create keeps the current focus.
  | {
      type: 'workspaceAdded';
      workspace: WorkspaceRecord;
      activeTabId: TabId;
      focusedWorkspaceId: WorkspaceId;
    }
  | { type: 'tabAdded'; tab: Tab }
  | { type: 'paneAdded'; pane: Pane }
  // The focus changes of the default view. A client's own view arrives as clientViewChanged.
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
  | { type: 'tabZoomChanged'; tabId: TabId; zoomedPaneId: PaneId | undefined }
  | {
      type: 'paneStateChanged';
      paneId: PaneId;
      lifecycle: PaneLifecycle;
      exitCode: number | undefined;
      error: string | undefined;
    }
  | { type: 'paneResized'; paneId: PaneId; size: TerminalSize }
  // The attached client becomes the foreground client, and a detached foreground client leaves it.
  // Only a foreground client that these two do not imply is reported by foregroundChanged.
  | { type: 'clientAttached'; client: Client }
  | { type: 'clientViewChanged'; clientId: ClientId; view: View }
  | { type: 'foregroundChanged'; clientId: ClientId | undefined }
  | { type: 'clientResized'; clientId: ClientId; size: TerminalSize }
  | { type: 'clientThemeChanged'; clientId: ClientId; theme: Theme }
  | { type: 'clientDetached'; clientId: ClientId; reason: DetachReason }
  | { type: 'serverStopping' };

type TabIntent = Extract<Intent, { type: 'createTab' | 'focusTab' | 'closeTab' }>;

type PaneIntent = Extract<
  Intent,
  { type: 'splitPane' | 'focusPane' | 'closePane' | 'zoomPane' | 'resizePane' }
>;

type RejectReason =
  | 'serverStopping'
  | 'sessionNotEmpty'
  | 'unknownClient'
  | 'unknownWorkspace'
  | 'unknownTab'
  | 'unknownPane'
  | 'paneTooSmall'
  | 'noSplit';

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
  workspaces: readonly WorkspaceRecord[];
  tabs: readonly Tab[];
  panes: readonly Pane[];
  defaultView: View;
  attachedClientId: ClientId | undefined;
  foregroundClientId: ClientId | undefined;
  clients: readonly Client[];
}

type ClientIntent = Extract<
  Intent,
  {
    type: 'attachClient' | 'resizeClient' | 'markClientActive' | 'setClientTheme' | 'detachClient';
  }
>;

export const createState = (): State => ({
  workspaces: [],
  tabs: [],
  panes: [],
  defaultView: { focusedWorkspaceId: undefined, activeTabs: [] },
  attachedClientId: undefined,
  foregroundClientId: undefined,
  clients: [],
  clientActivity: new Map(),
  nextActivity: 1,
  stopping: false,
  nextWorkspaceNumber: 1,
  nextTabNumber: 1,
  nextPaneNumber: 1,
  nextClientNumber: 1,
  nextGeneration: 1,
  startFallbacks: [],
  layoutArea: paneSize(undefined),
  stateBeforeSplit: new Map(),
  revision: 0,
});

export const snapshot = (state: State): Snapshot => ({
  revision: state.revision,
  workspaces: state.workspaces,
  tabs: state.tabs,
  panes: state.panes,
  defaultView: state.defaultView,
  attachedClientId: state.attachedClientId,
  foregroundClientId: state.foregroundClientId,
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

export const activeTabOf = (view: View, id: WorkspaceId | undefined): TabId | undefined =>
  view.activeTabs.find((active) => active.workspaceId === id)?.tabId;

// The focused pane of the tab the source client's view shows in a workspace, or the default
// view's for the CLI.
export const shownFocusedPaneId = (
  state: State,
  id: WorkspaceId,
  source: ClientId | undefined,
): PaneId | undefined => {
  const sourceView = state.clients.find((client) => client.id === source)?.view;
  const activeId = activeTabOf(sourceView ?? state.defaultView, id);

  return state.tabs.find((tab) => tab.id === activeId)?.focusedPaneId;
};

// The pane with the focus in the tab the default view shows.
export const focusedPane = (
  state: Pick<Snapshot, 'tabs' | 'panes' | 'defaultView'>,
): Pane | undefined => {
  const { defaultView } = state;
  const activeId = activeTabOf(defaultView, defaultView.focusedWorkspaceId);
  const tab = state.tabs.find((known) => known.id === activeId);

  return state.panes.find((known) => known.id === tab?.focusedPaneId);
};

const sameView = (left: View, right: View): boolean =>
  left.focusedWorkspaceId === right.focusedWorkspaceId &&
  left.activeTabs.length === right.activeTabs.length &&
  left.activeTabs.every((active) => activeTabOf(right, active.workspaceId) === active.tabId);

const withActiveTab = (view: View, id: WorkspaceId, activeId: TabId): View => {
  const known = view.activeTabs.some((active) => active.workspaceId === id);

  const activeTabs = known
    ? view.activeTabs.map((active) =>
        active.workspaceId === id ? { workspaceId: id, tabId: activeId } : active,
      )
    : [...view.activeTabs, { workspaceId: id, tabId: activeId }];

  return { ...view, activeTabs };
};

const withoutWorkspace = (view: View, id: WorkspaceId): View => ({
  ...view,
  activeTabs: view.activeTabs.filter((active) => active.workspaceId !== id),
});

const hasClient = (state: State, id: ClientId | undefined): boolean =>
  state.clients.some((client) => client.id === id);

// Applies the update to the views in scope: the default view always, and one client's view for a
// terminal client or every client's view for the CLI.
const updateViews = (
  state: State,
  source: ClientId | undefined,
  update: (view: View) => View,
): State => {
  const clients = state.clients.map((client) =>
    source === undefined || client.id === source
      ? { ...client, view: update(client.view) }
      : client,
  );

  return { ...state, defaultView: update(state.defaultView), clients };
};

// Applies the update to every view. It learns whose view it gets: a client id, or none for the
// default view.
const repairViews = (state: State, update: (view: View, owner?: ClientId) => View): State => ({
  ...state,
  defaultView: update(state.defaultView),
  clients: state.clients.map((client) => ({ ...client, view: update(client.view, client.id) })),
});

// The views a create in this scope moves, as they were before it.
const viewsBefore = (state: State, source: ClientId | undefined): ViewBefore[] => {
  const moved = state.clients.filter((client) => source === undefined || client.id === source);

  return [
    { clientId: undefined, view: state.defaultView },
    ...moved.map((client) => ({ clientId: client.id, view: client.view })),
  ];
};

const viewBeforeOf = (restore: StartFallback | undefined, owner?: ClientId): View | undefined =>
  restore?.views.find((known) => known.clientId === owner)?.view;

const defaultViewChanges = (before: View, after: View): Change[] => {
  const changes: Change[] = [];

  for (const { workspaceId: id, tabId: activeId } of after.activeTabs) {
    const previous = activeTabOf(before, id);

    if (previous !== undefined && previous !== activeId) {
      changes.push({ type: 'tabFocused', workspaceId: id, tabId: activeId });
    }
  }

  const { focusedWorkspaceId } = after;

  if (focusedWorkspaceId !== undefined && focusedWorkspaceId !== before.focusedWorkspaceId) {
    changes.push({ type: 'workspaceFocused', workspaceId: focusedWorkspaceId });
  }

  return changes;
};

const clientViewChanges = (before: readonly Client[], after: readonly Client[]): Change[] => {
  const changes: Change[] = [];

  for (const client of after) {
    const previous = before.find((known) => known.id === client.id);

    if (previous !== undefined && !sameView(previous.view, client.view)) {
      changes.push({ type: 'clientViewChanged', clientId: client.id, view: client.view });
    }
  }

  return changes;
};

const viewChanges = (before: State, after: State): Change[] => [
  ...defaultViewChanges(before.defaultView, after.defaultView),
  ...clientViewChanges(before.clients, after.clients),
];

const markActive = (state: State, id: ClientId): State => ({
  ...state,
  foregroundClientId: id,
  clientActivity: new Map(state.clientActivity).set(id, state.nextActivity),
  nextActivity: state.nextActivity + 1,
});

const latestActiveClient = (state: State): ClientId | undefined => {
  let latest: ClientId | undefined;
  let latestActivity = 0;

  for (const client of state.clients) {
    const activity = state.clientActivity.get(client.id) ?? 0;

    if (activity > latestActivity) {
      latest = client.id;
      latestActivity = activity;
    }
  }

  return latest;
};

// Reports the foreground client unless the attach or detach change already implies it.
const foregroundChanges = (implied: ClientId | undefined, state: State): Change[] =>
  state.foregroundClientId === implied
    ? []
    : [{ type: 'foregroundChanged', clientId: state.foregroundClientId }];

// The colors the pane's terminal answers with: those of the attached client, once it reported them.
export const paneTheme = (state: State): Theme | undefined => attachedClientOf(state)?.theme;

const sameTheme = (left: Theme | undefined, right: Theme): boolean =>
  left?.foreground === right.foreground &&
  left.background === right.background &&
  left.palette.every((color, index) => color === right.palette[index]);

const tabPaneSizes = (tabs: readonly Tab[], area: TerminalSize): Map<PaneId, TerminalSize> => {
  const sizes = new Map<PaneId, TerminalSize>();

  for (const tab of tabs) {
    for (const { paneId: id, terminal } of layoutPanes(
      shownLayout(tab.layout, tab.zoomedPaneId),
      area,
    )) {
      sizes.set(id, { columns: terminal.columns, rows: terminal.rows });
    }
  }

  return sizes;
};

const fitPanesTo = (
  state: State,
  area: TerminalSize,
): { panes: readonly Pane[]; changes: Change[] } => {
  const sizes = tabPaneSizes(state.tabs, area);
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

const lonePaneSize = (state: State, id: PaneId): TerminalSize => {
  const [lone] = layoutPanes({ kind: 'pane', paneId: id }, state.layoutArea);

  invariant(lone !== undefined, `Layout has no pane ${id}.`);

  return { columns: lone.terminal.columns, rows: lone.terminal.rows };
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
  source: ClientId | undefined,
): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
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

  // A view with no focus takes the first workspace, background or not.
  const added = repairViews(state, (view) => ({
    ...withActiveTab(view, workspace.id, tab.id),
    focusedWorkspaceId: view.focusedWorkspaceId ?? workspace.id,
  }));

  const focused = background
    ? added
    : updateViews(added, source, (view) => ({ ...view, focusedWorkspaceId: workspace.id }));

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

  return commit(next, [
    { type: 'workspaceAdded', workspace, activeTabId: tab.id, focusedWorkspaceId },
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
    ...clientViewChanges(state.clients, next.clients),
  ]);
};

const focusWorkspace = (
  state: State,
  id: WorkspaceId,
  source: ClientId | undefined,
): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  if (!state.workspaces.some((workspace) => workspace.id === id)) {
    return reject(state, 'unknownWorkspace');
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

  return commit(focused, viewChanges(state, focused));
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

const removeTab = (state: State, tab: Tab, restore?: StartFallback): Applied => {
  const remaining = state.panes.filter((pane) => pane.tabId !== tab.id);
  const removedPanes = state.panes.filter((pane) => pane.tabId === tab.id);
  const changes: Change[] = removedPanes.map((pane) => ({ type: 'paneRemoved', paneId: pane.id }));

  changes.push({ type: 'tabRemoved', tabId: tab.id });

  const tabs = state.tabs.filter((known) => known.id !== tab.id);
  const owner = state.workspaces.find((workspace) => workspace.id === tab.workspaceId);
  const tabIds = owner?.tabIds.filter((id) => id !== tab.id) ?? [];
  const next: State = { ...state, panes: remaining, tabs };

  if (owner === undefined) {
    return commit(next, changes);
  }

  if (tabIds.length > 0) {
    const neighbor = tabAfterRemoval(owner, tab.id);

    invariant(neighbor !== undefined, `Workspace ${owner.id} has no tab to activate.`);

    const workspaces = state.workspaces.map((workspace) =>
      workspace.id === owner.id ? { ...workspace, tabIds } : workspace,
    );

    // A view that showed the closed tab returns to its own earlier tab if that still exists. Else
    // the default view moves to the neighbor and client views follow the default view. A view that
    // moved on keeps its tab.
    const moveView = (view: View, viewOwner: ClientId | undefined, fallback: TabId): View => {
      const earlier = activeTabOf(viewBeforeOf(restore, viewOwner) ?? view, owner.id);
      const restored = earlier !== undefined && tabIds.includes(earlier) ? earlier : undefined;

      return activeTabOf(view, owner.id) === tab.id
        ? withActiveTab(view, owner.id, restored ?? fallback)
        : view;
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

    return commit(repaired, changes);
  }

  const ordinary = workspaceAfterRemoval(state, owner.id);

  const repaired = repairViews(next, (view, viewOwner) => {
    const withoutOwner = withoutWorkspace(view, owner.id);
    const earlier = viewBeforeOf(restore, viewOwner)?.focusedWorkspaceId;
    const isKnown = state.workspaces.some((workspace) => workspace.id === earlier);
    const restored = isKnown && earlier !== owner.id ? earlier : undefined;

    return view.focusedWorkspaceId === owner.id
      ? { ...withoutOwner, focusedWorkspaceId: restored ?? ordinary }
      : withoutOwner;
  });

  const workspaces = state.workspaces.filter((workspace) => workspace.id !== owner.id);

  changes.push({
    type: 'workspaceRemoved',
    workspaceId: owner.id,
    focusedWorkspaceId: repaired.defaultView.focusedWorkspaceId,
  });

  changes.push(...clientViewChanges(state.clients, repaired.clients));

  return commit({ ...repaired, workspaces }, changes);
};

const createTab = (
  state: State,
  id: WorkspaceId,
  folder: string | undefined,
  source: ClientId | undefined,
): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const owner = state.workspaces.find((workspace) => workspace.id === id);

  if (owner === undefined) {
    return reject(state, 'unknownWorkspace');
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

  const tab: Tab = {
    id: pane.tabId,
    workspaceId: id,
    layout: { kind: 'pane', paneId: pane.id },
    focusedPaneId: pane.id,
    zoomedPaneId: undefined,
  };

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === id ? { ...workspace, tabIds: [...workspace.tabIds, tab.id] } : workspace,
  );

  const shown = updateViews(state, source, (view) => withActiveTab(view, id, tab.id));

  const next: State = {
    ...shown,
    workspaces,
    tabs: [...state.tabs, tab],
    panes: [...state.panes, pane],
    startFallbacks: [
      ...state.startFallbacks,
      { paneId: pane.id, views: viewsBefore(state, source) },
    ],
    nextTabNumber: state.nextTabNumber + 1,
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
  };

  return commit(next, [
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
    ...viewChanges(state, next),
  ]);
};

const showTab = (
  state: State,
  source: ClientId | undefined,
  owner: WorkspaceId,
  id: TabId,
): State =>
  updateViews(state, source, (view) => ({
    ...withActiveTab(view, owner, id),
    focusedWorkspaceId: owner,
  }));

const focusTab = (state: State, id: TabId, source: ClientId | undefined): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const tab = state.tabs.find((known) => known.id === id);

  if (tab === undefined) {
    return reject(state, 'unknownTab');
  }

  const owner = state.workspaces.find((workspace) => workspace.id === tab.workspaceId);

  invariant(owner !== undefined, `Tab ${id} has no workspace.`);

  const focused = showTab(state, source, owner.id, id);

  return commit(focused, viewChanges(state, focused));
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

// The views of a closing workspace move once, not after each of its tabs.
const isNotViewChange = (change: Change): boolean =>
  change.type !== 'tabFocused' && change.type !== 'clientViewChanged';

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
    changes.push(...removed.changes.filter(isNotViewChange));
  }

  changes.push(...clientViewChanges(state.clients, current.clients));

  return commit({ ...current, revision: state.revision }, changes);
};

const unzoomChanges = (tab: Tab): Change[] =>
  tab.zoomedPaneId === undefined
    ? []
    : [{ type: 'tabZoomChanged', tabId: tab.id, zoomedPaneId: undefined }];

const splitPane = (
  state: State,
  id: PaneId,
  direction: SplitDirection,
  folder: string | undefined,
): Applied | Rejected => {
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

  return commit({ ...split, panes: fitted.panes }, [
    { type: 'paneAdded', pane: added },
    { type: 'tabLayoutChanged', tabId: tab.id, layout },
    { type: 'paneFocused', tabId: tab.id, paneId: added.id },
    ...unzoomChanges(tab),
    ...fitted.changes,
  ]);
};

const focusPane = (state: State, id: PaneId, source: ClientId | undefined): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return reject(state, 'unknownPane');
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
    return commit(focused, changes);
  }

  const fitted = fitPanes(focused);

  return commit({ ...focused, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

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

// The pane's area goes to its sibling. The focus moves to the sibling only when the pane had it.
const closePaneIn = (state: State, tab: Tab, id: PaneId): Applied => {
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

const zoomPane = (state: State, id: PaneId): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return reject(state, 'unknownPane');
  }

  if (tab.layout.kind === 'pane') {
    return commit(state, []);
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

  return commit({ ...zoomed, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

const resizePane = (
  state: State,
  id: PaneId,
  direction: ResizeDirection,
  cells: number,
): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (target === undefined || tab === undefined) {
    return reject(state, 'unknownPane');
  }

  const layout = resizeLayout(tab.layout, id, direction, cells, state.layoutArea);

  if (layout === undefined) {
    return reject(state, 'noSplit');
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

  return commit({ ...resized, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

const attachClient = (state: State, size: TerminalSize): Applied => {
  const client: Client = {
    id: clientId(state.nextClientNumber),
    size,
    theme: undefined,
    view: state.defaultView,
  };

  const previous = state.attachedClientId;
  const changes: Change[] = [];

  if (previous !== undefined) {
    changes.push({ type: 'clientDetached', clientId: previous, reason: 'takenOver' });
  }

  changes.push({ type: 'clientAttached', client });

  const activity = new Map(state.clientActivity);

  if (previous !== undefined) {
    activity.delete(previous);
  }

  const attached: State = markActive(
    {
      ...state,
      attachedClientId: client.id,
      clients: [...state.clients.filter((known) => known.id !== previous), client],
      clientActivity: activity,
      nextClientNumber: state.nextClientNumber + 1,
      layoutArea: paneSize(size),
    },
    client.id,
  );

  const fitted = fitPanes(attached);

  return commit({ ...attached, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

const resizeClient = (state: State, id: ClientId, size: TerminalSize): Applied | Rejected => {
  const resizing = state.clients.find((known) => known.id === id);

  if (resizing === undefined) {
    return reject(state, 'unknownClient');
  }

  const active = markActive(state, id);
  const foreground = foregroundChanges(state.foregroundClientId, active);

  if (sameSize(resizing.size, size)) {
    return commit(active, foreground);
  }

  const resized: State = {
    ...active,
    clients: state.clients.map((client) => (client.id === id ? { ...client, size } : client)),
    layoutArea: paneSize(size),
  };

  const fitted = fitPanes(resized);

  return commit({ ...resized, panes: fitted.panes }, [
    ...foreground,
    { type: 'clientResized', clientId: id, size },
    ...fitted.changes,
  ]);
};

const markClientActive = (state: State, id: ClientId): Applied | Rejected => {
  if (!hasClient(state, id)) {
    return reject(state, 'unknownClient');
  }

  const active = markActive(state, id);

  return commit(active, foregroundChanges(state.foregroundClientId, active));
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
  const clientActivity = new Map(state.clientActivity);

  clientActivity.delete(id);

  const remaining: State = {
    ...state,
    attachedClientId,
    clients: state.clients.filter((client) => client.id !== id),
    clientActivity,
  };

  // The client with the latest activity takes over a foreground that its client leaves.
  const leavesForeground = state.foregroundClientId === id;

  const foregroundClientId = leavesForeground
    ? latestActiveClient(remaining)
    : state.foregroundClientId;

  const next: State = { ...remaining, foregroundClientId };
  const implied = leavesForeground ? undefined : state.foregroundClientId;

  return commit(next, [
    { type: 'clientDetached', clientId: id, reason: 'requested' },
    ...foregroundChanges(implied, next),
  ]);
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
      error: undefined,
    });

    return { ...pane, lifecycle: 'closing' as const };
  });

  changes.push({ type: 'serverStopping' });

  return commit({ ...state, panes, stopping: true }, changes);
};

// A pane without a folder read keeps the folder it was restored with.
export const savedSessionOf = (
  state: State,
  readFolders: ReadonlyMap<PaneId, string>,
): SavedSession => ({
  workspaces: state.workspaces.map((workspace) => {
    const activeTabId = activeTabOf(state.defaultView, workspace.id);

    invariant(activeTabId !== undefined, `Workspace ${workspace.id} has no active tab.`);

    return { ...workspace, activeTabId };
  }),
  tabs: state.tabs,
  panes: state.panes.map((pane) => ({
    id: pane.id,
    tabId: pane.tabId,
    startFolder: readFolders.get(pane.id) ?? pane.startFolder,
  })),
  focusedWorkspaceId: state.defaultView.focusedWorkspaceId,
  nextWorkspaceNumber: state.nextWorkspaceNumber,
  nextTabNumber: state.nextTabNumber,
  nextPaneNumber: state.nextPaneNumber,
});

const restoreSession = (state: State, session: SavedSession): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  if (state.workspaces.length > 0) {
    return reject(state, 'sessionNotEmpty');
  }

  // A pane hidden by zoom has no shown size, so it starts at its size in the unzoomed layout.
  const unzoomed = session.tabs.map((tab) => ({ ...tab, zoomedPaneId: undefined }));

  const sizes = new Map([
    ...tabPaneSizes(unzoomed, state.layoutArea),
    ...tabPaneSizes(session.tabs, state.layoutArea),
  ]);

  const panes = session.panes.map((saved, index): Pane => {
    const size = sizes.get(saved.id);

    invariant(size !== undefined, `Saved pane ${saved.id} is not in the layout of its tab.`);

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
  };

  const workspaces = session.workspaces.map(({ id, root, label, tabIds }): WorkspaceRecord => ({
    id,
    root,
    label,
    tabIds,
  }));

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

  const { focusedWorkspaceId } = session;
  const changes: Change[] = [];

  for (const [index, workspace] of workspaces.entries()) {
    const activeTabId = session.workspaces[index]?.activeTabId;

    invariant(focusedWorkspaceId !== undefined, 'A saved session with workspaces has no focus.');
    invariant(activeTabId !== undefined, `Saved workspace ${workspace.id} has no active tab.`);
    changes.push({ type: 'workspaceAdded', workspace, activeTabId, focusedWorkspaceId });
  }

  for (const tab of session.tabs) {
    changes.push({ type: 'tabAdded', tab });
  }

  for (const pane of panes) {
    changes.push({ type: 'paneAdded', pane });
  }

  changes.push(...clientViewChanges(state.clients, next.clients));

  return commit(next, changes);
};

const isTabIntent = (intent: Intent): intent is TabIntent =>
  intent.type === 'createTab' || intent.type === 'focusTab' || intent.type === 'closeTab';

const paneIntentTypes: ReadonlySet<Intent['type']> = new Set<PaneIntent['type']>([
  'splitPane',
  'focusPane',
  'closePane',
  'zoomPane',
  'resizePane',
]);

const isPaneIntent = (intent: Intent): intent is PaneIntent => paneIntentTypes.has(intent.type);

const applyTabIntent = (state: State, intent: TabIntent): Applied | Rejected => {
  if (intent.type === 'createTab') {
    return createTab(state, intent.workspaceId, intent.folder, intent.clientId);
  }

  return intent.type === 'focusTab'
    ? focusTab(state, intent.tabId, intent.clientId)
    : closeTab(state, intent.tabId);
};

const applyPaneIntent = (state: State, intent: PaneIntent): Applied | Rejected => {
  if (intent.type === 'splitPane') {
    return splitPane(state, intent.paneId, intent.direction, intent.folder);
  }

  if (intent.type === 'focusPane') {
    return focusPane(state, intent.paneId, intent.clientId);
  }

  if (intent.type === 'zoomPane') {
    return zoomPane(state, intent.paneId);
  }

  if (intent.type === 'resizePane') {
    return resizePane(state, intent.paneId, intent.direction, intent.cells);
  }

  return closePane(state, intent.paneId);
};

const clientIntentTypes: ReadonlySet<Intent['type']> = new Set<ClientIntent['type']>([
  'attachClient',
  'resizeClient',
  'markClientActive',
  'setClientTheme',
  'detachClient',
]);

const isClientIntent = (intent: Intent): intent is ClientIntent =>
  clientIntentTypes.has(intent.type);

const applyClientIntent = (state: State, intent: ClientIntent): Applied | Rejected => {
  if (intent.type === 'attachClient') {
    return attachClient(state, intent.size);
  }

  if (intent.type === 'resizeClient') {
    return resizeClient(state, intent.clientId, intent.size);
  }

  if (intent.type === 'markClientActive') {
    return markClientActive(state, intent.clientId);
  }

  if (intent.type === 'setClientTheme') {
    return setClientTheme(state, intent.clientId, intent.theme);
  }

  return detachClient(state, intent.clientId);
};

const applyKnownIntent = (state: State, intent: Intent): Applied | Rejected => {
  if (intent.type === 'createWorkspace') {
    return createWorkspace(state, intent.root, intent.label, intent.background, intent.clientId);
  }

  if (intent.type === 'focusWorkspace') {
    return focusWorkspace(state, intent.workspaceId, intent.clientId);
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

  if (isClientIntent(intent)) {
    return applyClientIntent(state, intent);
  }

  if (intent.type === 'restoreSession') {
    return restoreSession(state, intent.session);
  }

  return stopServer(state);
};

export const applyIntent = (state: State, intent: Intent): Applied | Rejected => {
  const source = 'clientId' in intent ? intent.clientId : undefined;

  if (source !== undefined && !hasClient(state, source)) {
    return reject(state, 'unknownClient');
  }

  return applyKnownIntent(state, intent);
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

const markFailed = (state: State, pane: Pane, message: string): Applied =>
  commit(
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

const markRunning = (state: State, pane: Pane): Applied => {
  const stateBeforeSplit = new Map(state.stateBeforeSplit);

  stateBeforeSplit.delete(pane.id);

  const next: State = {
    ...state,
    stateBeforeSplit,
    panes: replacePane(state, { ...pane, lifecycle: 'running' }),
    startFallbacks: state.startFallbacks.filter((known) => known.paneId !== pane.id),
  };

  return commit(next, [
    {
      type: 'paneStateChanged',
      paneId: pane.id,
      lifecycle: 'running',
      exitCode: undefined,
      error: undefined,
    },
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

  if (fact.type === 'paneFailedToStart' && pane.restored && !state.stopping) {
    return markFailed(settled, pane, fact.message);
  }

  if (fact.type === 'paneFailedToStart') {
    return endPane(settled, pane, undefined, restore);
  }

  return pane.lifecycle === 'starting' ? markRunning(state, pane) : ignore(state, fact);
};
