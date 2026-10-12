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
  | { type: 'createWorkspace'; root: string; label: string | undefined; background: boolean }
  | { type: 'focusWorkspace'; workspaceId: WorkspaceId }
  | { type: 'renameWorkspace'; workspaceId: WorkspaceId; label: string }
  | { type: 'closeWorkspace'; workspaceId: WorkspaceId }
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
  // Carries the focus that remains, so a client needs no rule to pick it.
  | {
      type: 'workspaceRemoved';
      workspaceId: WorkspaceId;
      focusedWorkspaceId: WorkspaceId | undefined;
    }
  | { type: 'tabRemoved'; tabId: TabId }
  | { type: 'paneRemoved'; paneId: PaneId }
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

type RejectReason = 'serverStopping' | 'unknownClient' | 'unknownWorkspace';

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
const focusAfterRemoval = (state: State, removedId: WorkspaceId): WorkspaceId | undefined => {
  if (state.focusedWorkspaceId !== removedId) {
    return state.focusedWorkspaceId;
  }

  const index = state.workspaces.findIndex((workspace) => workspace.id === removedId);
  const neighbor = state.workspaces[index + 1] ?? state.workspaces[index - 1];

  return neighbor?.id;
};

const removeTab = (state: State, tab: Tab): Applied => {
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
    const workspaces = state.workspaces.map((workspace) =>
      workspace.id === owner.id ? { ...workspace, tabIds } : workspace,
    );

    next = { ...next, workspaces };

    return commit(next, changes);
  }

  const focusedWorkspaceId = focusAfterRemoval(state, owner.id);

  changes.push({ type: 'workspaceRemoved', workspaceId: owner.id, focusedWorkspaceId });

  const workspaces = state.workspaces.filter((workspace) => workspace.id !== owner.id);

  return commit({ ...next, workspaces, focusedWorkspaceId }, changes);
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
    changes.push(...removed.changes);
  }

  return commit({ ...current, revision: state.revision }, changes);
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

const endPane = (state: State, pane: Pane, exitCode: number | undefined): Applied => {
  if (state.stopping) {
    const exited = { ...pane, lifecycle: 'exited' as const, exitCode };

    return commit({ ...state, panes: replacePane(state, exited) }, [
      { type: 'paneStateChanged', paneId: pane.id, lifecycle: 'exited', exitCode },
    ]);
  }

  const tab = state.tabs.find((known) => known.id === pane.tabId);

  invariant(tab !== undefined, `Pane ${pane.id} has no tab.`);

  return removeTab(state, tab);
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
