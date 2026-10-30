import { focusedPane, shownView, viewedPane } from './client/client.ts';
import type { PaneLayoutCommand, StoreSnapshot, TabRoute } from './client/client.ts';
import type { PaneId, TabId, WorkspaceId } from './ids.ts';
import { invariant } from './invariant.ts';
import { layoutPaneIds } from './layout.ts';
import type { LayoutChoice } from './layout.ts';

export type PaneAction =
  | 'add'
  | 'splitBelow'
  | 'splitRight'
  | 'focusPrevious'
  | 'focusNext'
  | 'close'
  | 'breakPane'
  | 'zoom'
  | 'resizeLeft'
  | 'resizeRight'
  | 'resizeUp'
  | 'resizeDown'
  | 'rotateForward'
  | 'rotateBackward'
  | 'focusLeft'
  | 'focusRight'
  | 'focusUp'
  | 'focusDown';

export type WorkspaceKey = 'next' | 'previous' | 'create' | 'close';

export type ActionViewKind = 'search' | 'help';

export type ActionIntent =
  | { kind: 'pane'; action: PaneAction }
  | { kind: 'workspace'; key: WorkspaceKey }
  | { kind: 'tab'; route: TabRoute }
  | { kind: 'layout'; choice: LayoutChoice }
  | { kind: 'scrollEnter' }
  | { kind: 'paste' }
  | { kind: 'detach' }
  | { kind: 'view'; view: ActionViewKind };

export interface ActionTarget {
  workspaceId: WorkspaceId | undefined;
  paneId: PaneId | undefined;
}

export interface ActionEntry {
  id: string;
  title: string;
  keys: readonly string[];
  intent: ActionIntent;
  cli: boolean;
  available: (snapshot: StoreSnapshot, target: ActionTarget) => boolean;
}

export type ActionCatalog = readonly ActionEntry[];

type ResizeDirection = Extract<PaneLayoutCommand, { action: 'resize' }>['direction'];

type RotateDirection = Extract<PaneLayoutCommand, { action: 'rotate' }>['direction'];

const resizeDirections: Partial<Record<PaneAction, ResizeDirection>> = {
  resizeLeft: 'left',
  resizeRight: 'right',
  resizeUp: 'up',
  resizeDown: 'down',
};

const focusDirections: Partial<Record<PaneAction, ResizeDirection>> = {
  focusLeft: 'left',
  focusRight: 'right',
  focusUp: 'up',
  focusDown: 'down',
};

const rotateDirections: Partial<Record<PaneAction, RotateDirection>> = {
  rotateForward: 'forward',
  rotateBackward: 'backward',
};

export const shownTargetOf = (snapshot: StoreSnapshot): ActionTarget => ({
  workspaceId: shownView(snapshot).focusedWorkspaceId,
  paneId: viewedPane(snapshot)?.id,
});

export const defaultTargetOf = (snapshot: StoreSnapshot): ActionTarget => ({
  workspaceId: snapshot.defaultView.focusedWorkspaceId,
  paneId: focusedPane(snapshot)?.id,
});

const workspaceOf = (snapshot: StoreSnapshot, workspaceId: WorkspaceId | undefined) =>
  snapshot.workspaces.find((workspace) => workspace.id === workspaceId);

const tabIdsOf = (
  snapshot: StoreSnapshot,
  workspaceId: WorkspaceId | undefined,
): readonly TabId[] => workspaceOf(snapshot, workspaceId)?.tabIds ?? [];

const tabOfPane = (snapshot: StoreSnapshot, paneId: PaneId | undefined) => {
  const pane = snapshot.panes.find((known) => known.id === paneId);

  return snapshot.tabs.find((known) => known.id === pane?.tabId);
};

// Visits every pane of the tab, including a zoomed tab's hidden panes and panes too small to draw.
const focusNeighborOf = (
  snapshot: StoreSnapshot,
  paneId: PaneId | undefined,
  offset: 1 | -1,
): PaneId | undefined => {
  const current = snapshot.panes.find((known) => known.id === paneId);
  const tab = tabOfPane(snapshot, paneId);

  if (current === undefined || tab === undefined) {
    return undefined;
  }

  const isMaster = tab.arrangement.choice === 'master';
  const order = isMaster ? tab.arrangement.order : layoutPaneIds(tab.layout);

  return order[order.indexOf(current.id) + offset];
};

const directionalCommandOf = (pane: PaneId, action: PaneAction): PaneLayoutCommand => {
  const rotateDirection = rotateDirections[action];

  if (rotateDirection !== undefined) {
    return { action: 'rotate', pane, direction: rotateDirection };
  }

  const focusDirection = focusDirections[action];

  if (focusDirection !== undefined) {
    return { action: 'focusDirection', pane, direction: focusDirection };
  }

  const resizeDirection = resizeDirections[action];

  invariant(resizeDirection !== undefined, `${action} is not a pane action.`);

  return { action: 'resize', pane, direction: resizeDirection, cells: 1 };
};

export const paneCommandOf = (
  snapshot: StoreSnapshot,
  pane: PaneId,
  action: PaneAction,
): PaneLayoutCommand | undefined => {
  if (action === 'add') {
    return { action: 'add', pane, cwd: undefined };
  }

  if (action === 'splitBelow' || action === 'splitRight') {
    const direction = action === 'splitBelow' ? 'below' : 'right';

    return { action: 'split', pane, direction, cwd: undefined };
  }

  if (action === 'focusPrevious' || action === 'focusNext') {
    const offset = action === 'focusPrevious' ? -1 : 1;
    const target = focusNeighborOf(snapshot, pane, offset);

    return target === undefined ? undefined : { action: 'focus', pane: target };
  }

  if (action === 'close') {
    return { action: 'close', pane };
  }

  if (action === 'breakPane') {
    return { action: 'move', pane, destination: { kind: 'newTab' } };
  }

  if (action === 'zoom') {
    return { action: 'zoom', pane };
  }

  return directionalCommandOf(pane, action);
};

export const workspaceNeighborOf = (
  ids: readonly WorkspaceId[],
  workspaceId: WorkspaceId,
  step: 1 | -1,
): WorkspaceId | undefined => {
  const index = ids.indexOf(workspaceId);

  return index === -1 ? undefined : ids[(index + step + ids.length) % ids.length];
};

const hasTargetPane = (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
  snapshot.panes.some((pane) => pane.id === target.paneId);

const hasRunningTargetPane = (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
  snapshot.panes.some((pane) => pane.id === target.paneId && pane.lifecycle === 'running');

const hasRotatablePane = (snapshot: StoreSnapshot, target: ActionTarget): boolean => {
  const tab = tabOfPane(snapshot, target.paneId);

  return tab?.arrangement.choice === 'master' && tab.arrangement.order.length >= 2;
};

const hasPreviousPane = (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
  focusNeighborOf(snapshot, target.paneId, -1) !== undefined;

const hasNextPane = (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
  focusNeighborOf(snapshot, target.paneId, 1) !== undefined;

const usesOtherLayout =
  (choice: LayoutChoice) =>
  (snapshot: StoreSnapshot, target: ActionTarget): boolean => {
    const tab = tabOfPane(snapshot, target.paneId);

    return tab !== undefined && tab.arrangement.choice !== choice;
  };

const hasTargetWorkspace = (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
  workspaceOf(snapshot, target.workspaceId) !== undefined;

const hasSeveralWorkspaces = (snapshot: StoreSnapshot): boolean => snapshot.workspaces.length > 1;

const hasSeveralTabs = (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
  tabIdsOf(snapshot, target.workspaceId).length > 1;

const hasTabNumber =
  (number: number) =>
  (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
    tabIdsOf(snapshot, target.workspaceId).length >= number;

const alwaysAvailable = (): boolean => true;

const paneEntry = (
  title: string,
  keys: readonly string[],
  action: PaneAction,
  available: ActionEntry['available'],
): ActionEntry => ({
  id: `pane.${action}`,
  title,
  keys,
  intent: { kind: 'pane', action },
  cli: true,
  available,
});

const tabFocusEntries: ActionEntry[] = Array.from({ length: 9 }, (_, index) => {
  const number = index + 1;

  return {
    id: `tab.focus-${number}`,
    title: `Focus tab ${number}`,
    keys: [String(number)],
    intent: { kind: 'tab', route: { kind: 'number', number } },
    cli: true,
    available: hasTabNumber(number),
  };
});

export const actionCatalog: ActionCatalog = [
  {
    id: 'workspace.next',
    title: 'Next workspace',
    keys: ['j'],
    intent: { kind: 'workspace', key: 'next' },
    cli: true,
    available: hasSeveralWorkspaces,
  },
  {
    id: 'workspace.previous',
    title: 'Previous workspace',
    keys: ['k'],
    intent: { kind: 'workspace', key: 'previous' },
    cli: true,
    available: hasSeveralWorkspaces,
  },
  {
    id: 'workspace.create',
    title: 'Create workspace',
    keys: ['c'],
    intent: { kind: 'workspace', key: 'create' },
    cli: true,
    available: alwaysAvailable,
  },
  {
    id: 'workspace.close',
    title: 'Close workspace',
    keys: ['X'],
    intent: { kind: 'workspace', key: 'close' },
    cli: true,
    available: hasTargetWorkspace,
  },
  {
    id: 'tab.create',
    title: 'Create tab',
    keys: ['t'],
    intent: { kind: 'tab', route: { kind: 'create' } },
    cli: true,
    available: hasTargetWorkspace,
  },
  {
    id: 'tab.previous',
    title: 'Previous tab',
    keys: ['H'],
    intent: { kind: 'tab', route: { kind: 'previous' } },
    cli: true,
    available: hasSeveralTabs,
  },
  {
    id: 'tab.next',
    title: 'Next tab',
    keys: ['L'],
    intent: { kind: 'tab', route: { kind: 'next' } },
    cli: true,
    available: hasSeveralTabs,
  },
  ...tabFocusEntries,
  paneEntry('Split pane below', ['s'], 'splitBelow', hasTargetPane),
  paneEntry('Split pane right', ['v'], 'splitRight', hasTargetPane),
  paneEntry('Focus previous pane', ['h'], 'focusPrevious', hasPreviousPane),
  paneEntry('Focus next pane', ['l'], 'focusNext', hasNextPane),
  paneEntry('Close pane', ['x'], 'close', hasTargetPane),
  paneEntry('Break pane into new tab', ['!'], 'breakPane', hasTargetPane),
  paneEntry('Zoom pane', ['z'], 'zoom', hasTargetPane),
  paneEntry('Resize pane left', ['<'], 'resizeLeft', hasTargetPane),
  paneEntry('Resize pane right', ['>'], 'resizeRight', hasTargetPane),
  paneEntry('Resize pane up', ['-'], 'resizeUp', hasTargetPane),
  paneEntry('Resize pane down', ['+'], 'resizeDown', hasTargetPane),
  paneEntry('Rotate panes forward', [], 'rotateForward', hasRotatablePane),
  paneEntry('Rotate panes backward', [], 'rotateBackward', hasRotatablePane),
  paneEntry('Focus pane left', [], 'focusLeft', hasTargetPane),
  paneEntry('Focus pane right', [], 'focusRight', hasTargetPane),
  paneEntry('Focus pane up', [], 'focusUp', hasTargetPane),
  paneEntry('Focus pane down', [], 'focusDown', hasTargetPane),
  {
    id: 'layout.master',
    title: 'Use master layout',
    keys: [],
    intent: { kind: 'layout', choice: 'master' },
    cli: true,
    available: usesOtherLayout('master'),
  },
  {
    id: 'layout.legacy',
    title: 'Use legacy split layout',
    keys: [],
    intent: { kind: 'layout', choice: 'legacy' },
    cli: true,
    available: usesOtherLayout('legacy'),
  },
  paneEntry('New pane', ['n'], 'add', hasTargetPane),
  {
    id: 'pane.paste',
    title: 'Paste clipboard into pane',
    keys: ['p'],
    intent: { kind: 'paste' },
    // The CLI pastes given text with `koja pane paste`; only a client reads its own clipboard.
    cli: false,
    available: hasRunningTargetPane,
  },
  {
    id: 'scroll.enter',
    title: 'Enter scroll mode',
    keys: ['['],
    intent: { kind: 'scrollEnter' },
    cli: false,
    available: alwaysAvailable,
  },
  {
    id: 'client.detach',
    title: 'Detach client',
    keys: ['d'],
    intent: { kind: 'detach' },
    cli: true,
    available: alwaysAvailable,
  },
  {
    id: 'view.search',
    title: 'Search actions',
    keys: ['/'],
    intent: { kind: 'view', view: 'search' },
    cli: false,
    available: alwaysAvailable,
  },
  {
    id: 'view.help',
    title: 'Show shortcut help',
    keys: ['?'],
    intent: { kind: 'view', view: 'help' },
    cli: false,
    available: alwaysAvailable,
  },
];

export const actionForKey = (catalog: ActionCatalog, key: string): ActionEntry | undefined =>
  catalog.find((entry) => entry.keys.includes(key));

export const availableActions = (
  catalog: ActionCatalog,
  snapshot: StoreSnapshot,
): ActionCatalog => {
  const target = shownTargetOf(snapshot);

  return catalog.filter((entry) => entry.available(snapshot, target));
};
