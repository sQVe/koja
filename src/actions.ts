import { focusedPane, shownView, viewedPane } from './client/client.ts';
import type { PaneLayoutCommand, StoreSnapshot, TabRoute } from './client/client.ts';
import type { PaneId, TabId, WorkspaceId } from './ids.ts';
import { invariant } from './invariant.ts';
import { layoutPanes, paneSize } from './layout.ts';

export type PaneAction =
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
  | 'resizeDown';

export type WorkspaceKey = 'next' | 'previous' | 'create' | 'close';

export type ActionViewKind = 'search' | 'help';

export type ActionIntent =
  | { kind: 'pane'; action: PaneAction }
  | { kind: 'workspace'; key: WorkspaceKey }
  | { kind: 'tab'; route: TabRoute }
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

const resizeDirections: Partial<Record<PaneAction, ResizeDirection>> = {
  resizeLeft: 'left',
  resizeRight: 'right',
  resizeUp: 'up',
  resizeDown: 'down',
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

const focusNeighborOf = (
  snapshot: StoreSnapshot,
  paneId: PaneId | undefined,
  offset: 1 | -1,
): PaneId | undefined => {
  const current = snapshot.panes.find((known) => known.id === paneId);
  const tab = snapshot.tabs.find((known) => known.id === current?.tabId);

  if (current === undefined || tab === undefined) {
    return undefined;
  }

  const order = layoutPanes(tab.layout, paneSize(undefined)).map((place) => place.paneId);

  return order[order.indexOf(current.id) + offset];
};

export const paneCommandOf = (
  snapshot: StoreSnapshot,
  pane: PaneId,
  action: PaneAction,
): PaneLayoutCommand | undefined => {
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

  const direction = resizeDirections[action];

  invariant(direction !== undefined, `${action} is not a pane action.`);

  return { action: 'resize', pane, direction, cells: 1 };
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

const hasPreviousPane = (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
  focusNeighborOf(snapshot, target.paneId, -1) !== undefined;

const hasNextPane = (snapshot: StoreSnapshot, target: ActionTarget): boolean =>
  focusNeighborOf(snapshot, target.paneId, 1) !== undefined;

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
  key: string,
  action: PaneAction,
  available: ActionEntry['available'],
): ActionEntry => ({
  id: `pane.${action}`,
  title,
  keys: [key],
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
  paneEntry('Split pane below', 's', 'splitBelow', hasTargetPane),
  paneEntry('Split pane right', 'v', 'splitRight', hasTargetPane),
  paneEntry('Focus previous pane', 'h', 'focusPrevious', hasPreviousPane),
  paneEntry('Focus next pane', 'l', 'focusNext', hasNextPane),
  paneEntry('Close pane', 'x', 'close', hasTargetPane),
  paneEntry('Break pane into new tab', '!', 'breakPane', hasTargetPane),
  paneEntry('Zoom pane', 'z', 'zoom', hasTargetPane),
  paneEntry('Resize pane left', '<', 'resizeLeft', hasTargetPane),
  paneEntry('Resize pane right', '>', 'resizeRight', hasTargetPane),
  paneEntry('Resize pane up', '-', 'resizeUp', hasTargetPane),
  paneEntry('Resize pane down', '+', 'resizeDown', hasTargetPane),
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
