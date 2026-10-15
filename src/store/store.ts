import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { paneSize } from '../layout.ts';
import type { Layout, ResizeDirection, SplitDirection, TerminalSize } from '../layout.ts';
import {
  attachClient,
  detachClient,
  hasClient,
  markClientActive,
  resizeClient,
  setClientTheme,
} from './clientTransitions.ts';
import {
  closePane,
  focusPane,
  resizePane,
  splitPane,
  transitionPaneFact,
  zoomPane,
} from './paneTransitions.ts';
import { restoreSession, stopServer } from './sessionTransitions.ts';
import { closeTab, createTab, focusTab } from './tabTransitions.ts';
import type { Outcome, Proposal } from './transitionOutcome.ts';
import { activeTabOf } from './view.ts';
import {
  closeWorkspace,
  createWorkspace,
  focusWorkspace,
  renameWorkspace,
} from './workspaceTransitions.ts';

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
export interface ViewBefore {
  clientId: ClientId | undefined;
  view: View;
}

export interface StartFallback {
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
      focus: boolean;
      clientId?: ClientId;
    }
  | { type: 'focusWorkspace'; workspaceId: WorkspaceId; clientId?: ClientId }
  | { type: 'renameWorkspace'; workspaceId: WorkspaceId; label: string }
  | { type: 'closeWorkspace'; workspaceId: WorkspaceId }
  | {
      type: 'createTab';
      workspaceId: WorkspaceId;
      folder: string | undefined;
      focus: boolean;
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
  // Carries the default focus that results, because a create without focus keeps the current focus.
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

export type RejectReason =
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

export { activeTabOf };

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

const commit = (proposal: Proposal): Applied => {
  const { state, changes } = proposal;
  const revision = state.revision + changes.length;

  return { kind: 'applied', state: { ...state, revision }, changes };
};

const reject = (state: State, reason: RejectReason): Rejected => ({
  kind: 'rejected',
  state,
  reason,
});

const settle = (state: State, outcome: Outcome): Applied | Rejected =>
  outcome.kind === 'refused' ? reject(state, outcome.reason) : commit(outcome);

const attachedClientOf = (state: State): Client | undefined =>
  state.clients.find((client) => client.id === state.attachedClientId);

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

// The colors the pane's terminal answers with: those of the attached client, once it reported them.
export const paneTheme = (state: State): Theme | undefined => attachedClientOf(state)?.theme;

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

const transitionTabIntent = (state: State, intent: TabIntent): Outcome => {
  if (intent.type === 'createTab') {
    return createTab(state, intent);
  }

  return intent.type === 'focusTab'
    ? focusTab(state, intent.tabId, intent.clientId)
    : closeTab(state, intent.tabId);
};

const transitionPaneIntent = (state: State, intent: PaneIntent): Outcome => {
  if (intent.type === 'splitPane') {
    return splitPane(state, intent);
  }

  if (intent.type === 'focusPane') {
    return focusPane(state, intent.paneId, intent.clientId);
  }

  if (intent.type === 'zoomPane') {
    return zoomPane(state, intent.paneId);
  }

  if (intent.type === 'resizePane') {
    return resizePane(state, intent);
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

const transitionClientIntent = (state: State, intent: ClientIntent): Outcome => {
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

const transitionIntent = (state: State, intent: Intent): Outcome => {
  if (intent.type === 'createWorkspace') {
    return createWorkspace(state, intent);
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
    return transitionTabIntent(state, intent);
  }

  if (isPaneIntent(intent)) {
    return transitionPaneIntent(state, intent);
  }

  if (isClientIntent(intent)) {
    return transitionClientIntent(state, intent);
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

  return settle(state, transitionIntent(state, intent));
};

const ignore = (state: State, fact: Fact): Ignored => ({
  kind: 'ignored',
  state,
  dispose: { paneId: fact.paneId, generation: fact.generation },
});

const isCurrent = (pane: Pane | undefined, fact: Fact): pane is Pane =>
  pane?.id === fact.paneId && pane.generation === fact.generation;

export const applyFact = (state: State, fact: Fact): Applied | Ignored => {
  const pane = state.panes.find((known) => known.id === fact.paneId);

  if (!isCurrent(pane, fact)) {
    return ignore(state, fact);
  }

  const proposal = transitionPaneFact(state, pane, fact);

  return proposal === undefined ? ignore(state, fact) : commit(proposal);
};
