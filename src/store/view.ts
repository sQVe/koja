import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import type { Change, Client, State, View, ViewBefore } from './store.ts';

export const activeTabOf = (view: View, id: WorkspaceId | undefined): TabId | undefined =>
  view.activeTabs.find((active) => active.workspaceId === id)?.tabId;

export const scrollOf = (view: View, id: PaneId): number | undefined =>
  view.scrolls.find((scroll) => scroll.paneId === id)?.topRow;

const sameScrolls = (left: View, right: View): boolean =>
  left.scrolls.length === right.scrolls.length &&
  left.scrolls.every((scroll) => scrollOf(right, scroll.paneId) === scroll.topRow);

const sameActiveTabs = (left: View, right: View): boolean =>
  left.activeTabs.length === right.activeTabs.length &&
  left.activeTabs.every((active) => activeTabOf(right, active.workspaceId) === active.tabId);

const sameView = (left: View, right: View): boolean =>
  left.focusedWorkspaceId === right.focusedWorkspaceId &&
  sameActiveTabs(left, right) &&
  sameScrolls(left, right);

export const withActiveTab = (view: View, id: WorkspaceId, activeId: TabId): View => {
  const known = view.activeTabs.some((active) => active.workspaceId === id);

  const activeTabs = known
    ? view.activeTabs.map((active) =>
        active.workspaceId === id ? { workspaceId: id, tabId: activeId } : active,
      )
    : [...view.activeTabs, { workspaceId: id, tabId: activeId }];

  return { ...view, activeTabs };
};

// Applies the update to the views in scope: the default view always, and one client's view for a
// terminal client or every client's view for the CLI.
export const updateViews = (
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
export const repairViews = (
  state: State,
  update: (view: View, owner?: ClientId) => View,
): State => ({
  ...state,
  defaultView: update(state.defaultView),
  clients: state.clients.map((client) => ({ ...client, view: update(client.view, client.id) })),
});

// The views a create in this scope moves, as they were before it.
export const viewsBefore = (state: State, source: ClientId | undefined): ViewBefore[] => {
  const moved = state.clients.filter((client) => source === undefined || client.id === source);

  return [
    { clientId: undefined, view: state.defaultView },
    ...moved.map((client) => ({ clientId: client.id, view: client.view })),
  ];
};

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

export const clientViewChanges = (
  before: readonly Client[],
  after: readonly Client[],
): Change[] => {
  const changes: Change[] = [];

  for (const client of after) {
    const previous = before.find((known) => known.id === client.id);

    // Stryker disable next-line ConditionalExpression: Callers of `clientViewChanges` keep this rule.
    if (previous !== undefined && !sameView(previous.view, client.view)) {
      changes.push({ type: 'clientViewChanged', clientId: client.id, view: client.view });
    }
  }

  return changes;
};

export const viewChanges = (before: State, after: State): Change[] => [
  ...defaultViewChanges(before.defaultView, after.defaultView),
  ...clientViewChanges(before.clients, after.clients),
];
