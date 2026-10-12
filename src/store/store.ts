import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { paneSize } from '../layout.ts';
import type { Layout, TerminalSize } from '../layout.ts';

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
  revision: number;
}

export type Intent =
  | { type: 'createWorkspace'; root: string; label: string }
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
  | { type: 'workspaceAdded'; workspace: Workspace }
  | { type: 'tabAdded'; tab: Tab }
  | { type: 'paneAdded'; pane: Pane }
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

type RejectReason = 'workspaceExists' | 'serverStopping' | 'unknownClient';

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

const fitPanes = (state: State): { panes: readonly Pane[]; changes: Change[] } => {
  const client = attachedClientOf(state);

  if (client === undefined) {
    return { panes: state.panes, changes: [] };
  }

  const size = paneSize(client.size);
  const changes: Change[] = [];

  const panes = state.panes.map((pane) => {
    if (!isLive(pane) || sameSize(size, pane.size)) {
      return pane;
    }

    changes.push({ type: 'paneResized', paneId: pane.id, size });

    return { ...pane, size };
  });

  return { panes, changes };
};

const createWorkspace = (state: State, root: string, label: string): Applied | Rejected => {
  if (state.stopping) {
    return reject(state, 'serverStopping');
  }

  if (state.workspaces.length > 0) {
    return reject(state, 'workspaceExists');
  }

  const pane: Pane = {
    id: paneId(state.nextPaneNumber),
    tabId: tabId(state.nextTabNumber),
    lifecycle: 'starting',
    size: paneSize(attachedClientOf(state)?.size),
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
    label,
    tabIds: [tab.id],
    activeTabId: tab.id,
  };

  const next: State = {
    ...state,
    workspaces: [...state.workspaces, workspace],
    tabs: [...state.tabs, tab],
    panes: [...state.panes, pane],
    focusedWorkspaceId: workspace.id,
    nextWorkspaceNumber: state.nextWorkspaceNumber + 1,
    nextTabNumber: state.nextTabNumber + 1,
    nextPaneNumber: state.nextPaneNumber + 1,
    nextGeneration: state.nextGeneration + 1,
  };

  return commit(next, [
    { type: 'workspaceAdded', workspace },
    { type: 'tabAdded', tab },
    { type: 'paneAdded', pane },
  ]);
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

export const applyIntent = (state: State, intent: Intent): Applied | Rejected => {
  if (intent.type === 'createWorkspace') {
    return createWorkspace(state, intent.root, intent.label);
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

// The pane is the last one, so its end stops the server.
const endPane = (state: State, pane: Pane, exitCode: number | undefined): Applied => {
  const changes: Change[] = [
    { type: 'paneStateChanged', paneId: pane.id, lifecycle: 'exited', exitCode },
  ];

  if (!state.stopping) {
    changes.push({ type: 'serverStopping' });
  }

  const next: State = {
    ...state,
    panes: replacePane(state, { ...pane, lifecycle: 'exited', exitCode }),
    stopping: true,
  };

  return commit(next, changes);
};

const markRunning = (state: State, pane: Pane): Applied => {
  const next: State = { ...state, panes: replacePane(state, { ...pane, lifecycle: 'running' }) };

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

  if (fact.type === 'paneExited') {
    return endPane(state, pane, fact.exitCode);
  }

  if (fact.type === 'paneFailedToStart') {
    return endPane(state, pane, undefined);
  }

  return pane.lifecycle === 'starting' ? markRunning(state, pane) : ignore(state, fact);
};
