import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { applyFact, applyIntent, createState } from './store.ts';
import type { Applied, Client, Fact, Ignored, Intent, Rejected, State, View } from './store.ts';

const expectApplied = (result: Applied | Ignored | Rejected): Applied => {
  invariant(result.kind === 'applied', `Expected an applied transition, got ${result.kind}.`);

  return result;
};

export const intent = (state: State, next: Intent): Applied =>
  expectApplied(applyIntent(state, next));

export const fact = (state: State, next: Fact): Applied => expectApplied(applyFact(state, next));

export const run = (intents: readonly Intent[]): State =>
  intents.reduce((state, next) => intent(state, next).state, createState());

export const createKoja = {
  type: 'createWorkspace',
  root: '/work/koja',
  label: 'koja',
  focus: true,
} satisfies Intent;

export const createDocs = {
  type: 'createWorkspace',
  root: '/work/docs',
  label: 'docs',
  focus: true,
} satisfies Intent;

export const createApi = {
  type: 'createWorkspace',
  root: '/work/api',
  label: 'api',
  focus: true,
} satisfies Intent;

const missingId = 99;

export const unknownWorkspace = workspaceId(missingId);

export const createTab = {
  type: 'createTab',
  workspaceId: workspaceId(1),
  folder: undefined,
  focus: true,
} satisfies Intent;

export const attachLarge: Intent = { type: 'attachClient', size: { columns: 101, rows: 25 } };

export const splitFirst = (direction: 'below' | 'right'): Intent => ({
  type: 'splitPane',
  paneId: paneId(1),
  direction,
  folder: undefined,
});

export const zoom = (id: number): Intent => ({ type: 'zoomPane', paneId: paneId(id) });

export const switchLayout = (id: number, choice: 'legacy' | 'master'): Intent => ({
  type: 'setTabLayout',
  tabId: tabId(id),
  choice,
});

export const addPane = (id: number): Intent => ({
  type: 'addPane',
  paneId: paneId(id),
  folder: undefined,
});

export const resize = (
  id: number,
  direction: 'left' | 'right' | 'up' | 'down',
  cells: number,
): Intent => ({ type: 'resizePane', paneId: paneId(id), direction, cells });

const zoomedPaneNumber = 4;

export const richSession: readonly Intent[] = [
  attachLarge,
  createKoja,
  createDocs,
  createTab,
  splitFirst('right'),
  zoom(zoomedPaneNumber),
  { type: 'renameWorkspace', workspaceId: workspaceId(2), label: 'manual' },
  { type: 'focusWorkspace', workspaceId: workspaceId(1) },
];

export const noFolders: ReadonlyMap<PaneId, string> = new Map();

export const attachedEmpty = (): State => intent(createState(), attachLarge).state;

// The store attaches one client at a time, so a second client joins by hand.
export const withClient = (state: State, id: number): State => {
  const client: Client = {
    id: clientId(id),
    size: { columns: 80, rows: 24 },
    theme: undefined,
    view: state.defaultView,
  };

  const clientActivity = new Map(state.clientActivity).set(client.id, state.nextActivity);

  return {
    ...state,
    clients: [...state.clients, client],
    clientActivity,
    nextActivity: state.nextActivity + 1,
    nextClientNumber: id + 1,
  };
};

export const twoClients = (...intents: readonly Intent[]): State =>
  withClient(run([...intents, attachLarge]), 2);

export const viewShowing = (workspace: number, tabs: readonly [number, number][]): View => ({
  focusedWorkspaceId: workspaceId(workspace),
  activeTabs: tabs.map(([owner, tab]) => ({ workspaceId: workspaceId(owner), tabId: tabId(tab) })),
  scrolls: [],
});

// Replaces the default view and the views of clients 1 and 2.
export const withViews = (state: State, views: readonly [View, View, View]): State => {
  const [defaultView, first, second] = views;

  return {
    ...state,
    defaultView,
    clients: state.clients.map((client, index) => ({
      ...client,
      view: index === 0 ? first : second,
    })),
  };
};

export const defined = <Value>(value: Value | undefined): Value => {
  invariant(value !== undefined, 'Expected a value.');

  return value;
};
