import { describe, expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { WorkspaceId } from '../ids.ts';
import {
  activeTabIdOf,
  applyChange,
  focusedPane,
  scrollTopOf,
  shownPaneIds,
  viewedPane,
} from './snapshot.ts';
import type { StoreSnapshot } from './snapshot.ts';

const size = { columns: 80, rows: 24 };

const view = {
  focusedWorkspaceId: workspaceId(1),
  activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(1) }],
  scrolls: [],
};

const first = { id: clientId(1), size, theme: undefined, view };

const second = { id: clientId(2), size, theme: undefined, view };

const snapshot: StoreSnapshot = {
  revision: 3,
  workspaces: [
    {
      id: workspaceId(1),
      root: '/work/koja',
      label: 'koja',
      tabIds: [tabId(1)],
    },
  ],
  tabs: [
    {
      id: tabId(1),
      workspaceId: workspaceId(1),
      layout: { kind: 'pane', paneId: paneId(1) },
      focusedPaneId: paneId(1),
      zoomedPaneId: undefined,
      label: undefined,
    },
  ],
  panes: [
    {
      id: paneId(1),
      tabId: tabId(1),
      lifecycle: 'running',
      generation: 1,
      size,
      exitCode: undefined,
      startFolder: undefined,
      restored: false,
      error: undefined,
    },
  ],
  defaultView: view,
  attachedClientId: first.id,
  foregroundClientId: first.id,
  clients: [first],
};

it('replaces the attached client when a client takes over', () => {
  const detached = applyChange(snapshot, {
    type: 'clientDetached',
    clientId: first.id,
    reason: 'takenOver',
  });

  const attached = applyChange(detached, { type: 'clientAttached', client: second });

  expect(attached.clients).toEqual([second]);
  expect(attached.attachedClientId).toBe(second.id);
});

it('moves a pane to another tab and keeps the rest of the pane', () => {
  const moved = applyChange(snapshot, { type: 'paneMoved', paneId: paneId(1), tabId: tabId(2) });

  expect(moved.panes).toMatchObject([{ id: paneId(1), tabId: tabId(2), generation: 1 }]);
});

it('records the exit of the pane', () => {
  const exited = applyChange(snapshot, {
    type: 'paneStateChanged',
    paneId: paneId(1),
    lifecycle: 'exited',
    exitCode: 3,
    error: undefined,
  });

  expect(focusedPane(exited)?.lifecycle).toBe('exited');
  expect(focusedPane(exited)?.exitCode).toBe(3);
});

it('resizes only the client the change names', () => {
  const resized = { columns: 100, rows: 30 };
  const both = { ...snapshot, clients: [first, second] };
  const next = applyChange(both, { type: 'clientResized', clientId: second.id, size: resized });

  expect(next.clients).toEqual([first, { ...second, size: resized }]);
});

it('records the theme of only the client the change names', () => {
  const theme = { foreground: 1, background: 2, palette: Array.from({ length: 16 }, () => 3) };
  const both = { ...snapshot, clients: [first, second] };
  const next = applyChange(both, { type: 'clientThemeChanged', clientId: second.id, theme });

  expect(next.clients).toEqual([first, { ...second, theme }]);
});

const secondWorkspace = {
  id: workspaceId(2),
  root: '/work/docs',
  label: 'docs',
  tabIds: [tabId(2)],
};

const secondTab = {
  id: tabId(2),
  workspaceId: workspaceId(2),
  layout: { kind: 'pane' as const, paneId: paneId(2) },
  focusedPaneId: paneId(2),
  zoomedPaneId: undefined,
  label: undefined,
};

const secondPane = {
  id: paneId(2),
  tabId: tabId(2),
  lifecycle: 'running' as const,
  generation: 2,
  size,
  exitCode: undefined,
  startFolder: undefined,
  restored: false,
  error: undefined,
};

const withSecond: StoreSnapshot = {
  ...snapshot,
  workspaces: [...snapshot.workspaces, secondWorkspace],
  tabs: [...snapshot.tabs, secondTab],
  panes: [...snapshot.panes, secondPane],
  defaultView: {
    focusedWorkspaceId: secondWorkspace.id,
    activeTabs: [
      { workspaceId: workspaceId(1), tabId: tabId(1) },
      { workspaceId: secondWorkspace.id, tabId: tabId(2) },
    ],
    scrolls: [],
  },
};

it('focuses a workspace', () => {
  const next = applyChange(withSecond, { type: 'workspaceFocused', workspaceId: workspaceId(1) });

  expect(next.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(focusedPane(next)?.id).toBe(paneId(1));
});

it('renames only the workspace the change names', () => {
  const next = applyChange(withSecond, {
    type: 'workspaceRenamed',
    workspaceId: workspaceId(2),
    label: 'notes',
  });

  expect(next.workspaces.map((workspace) => workspace.label)).toEqual(['koja', 'notes']);
});

it('removes a workspace with its tab and pane and takes the focus the change names', () => {
  const removed = [
    { type: 'paneRemoved', paneId: paneId(2) },
    { type: 'tabRemoved', tabId: tabId(2) },
    { type: 'workspaceRemoved', workspaceId: workspaceId(2), focusedWorkspaceId: workspaceId(1) },
  ] as const;

  const next = removed.reduce(applyChange, withSecond);

  expect(next.workspaces).toEqual(snapshot.workspaces);
  expect(next.tabs).toEqual(snapshot.tabs);
  expect(next.panes).toEqual(snapshot.panes);
  expect(next.defaultView).toEqual(view);
});

it('keeps the focused workspace and pane when a background workspace is added', () => {
  const workspace = {
    id: workspaceId(2),
    root: '/work/other',
    label: 'other',
    tabIds: [tabId(2)],
  };

  const added = applyChange(snapshot, {
    type: 'workspaceAdded',
    workspace,
    activeTabId: tabId(2),
    focusedWorkspaceId: workspaceId(1),
  });

  expect(added.workspaces).toHaveLength(2);
  expect(added.defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  expect(added.defaultView.activeTabs).toContainEqual({
    workspaceId: workspaceId(2),
    tabId: tabId(2),
  });

  expect(focusedPane(added)).toEqual(snapshot.panes[0]);
});

it('activates the tab a change names and keeps the pane in focus', () => {
  const withTwoTabs: StoreSnapshot = {
    ...snapshot,
    workspaces: [{ ...snapshot.workspaces[0]!, tabIds: [tabId(1), tabId(2)] }],
    tabs: [...snapshot.tabs, { ...secondTab, workspaceId: workspaceId(1) }],
    panes: [...snapshot.panes, secondPane],
  };

  const next = applyChange(withTwoTabs, {
    type: 'tabFocused',
    workspaceId: workspaceId(1),
    tabId: tabId(2),
  });

  expect(next.defaultView.activeTabs).toEqual([{ workspaceId: workspaceId(1), tabId: tabId(2) }]);
  expect(focusedPane(next)?.id).toBe(paneId(2));
});

it('lists the first tab once when its workspace and tab are added', () => {
  const workspace = { ...snapshot.workspaces[0]!, tabIds: [tabId(1)] };

  const next = applyChange(
    applyChange(
      { ...snapshot, workspaces: [], tabs: [] },
      {
        type: 'workspaceAdded',
        workspace,
        activeTabId: tabId(1),
        focusedWorkspaceId: workspace.id,
      },
    ),
    { type: 'tabAdded', tab: snapshot.tabs[0]! },
  );

  expect(next.workspaces[0]?.tabIds).toEqual([tabId(1)]);
});

it('replaces the layout of the tab the change names', () => {
  const layout = {
    kind: 'split' as const,
    direction: 'below' as const,
    ratio: 0.5,
    first: { kind: 'pane' as const, paneId: paneId(1) },
    second: { kind: 'pane' as const, paneId: paneId(3) },
  };

  const next = applyChange(withSecond, { type: 'tabLayoutChanged', tabId: tabId(1), layout });

  expect(next.tabs.map((tab) => tab.layout)).toEqual([layout, secondTab.layout]);
});

it('moves the focus of the tab the change names', () => {
  const next = applyChange(withSecond, {
    type: 'paneFocused',
    tabId: tabId(2),
    paneId: paneId(3),
  });

  expect(next.tabs.map((tab) => tab.focusedPaneId)).toEqual([paneId(1), paneId(3)]);
});

it('replaces the view of only the client the change names', () => {
  const both = { ...snapshot, clients: [first, second] };
  const moved = { focusedWorkspaceId: undefined, activeTabs: [], scrolls: [] };
  const next = applyChange(both, { type: 'clientViewChanged', clientId: second.id, view: moved });

  expect(next.clients).toEqual([first, { ...second, view: moved }]);
  expect(next.defaultView).toEqual(view);
});

it('records the foreground client the change names', () => {
  const next = applyChange(snapshot, { type: 'foregroundChanged', clientId: second.id });

  expect(next.foregroundClientId).toBe(second.id);
});

it('makes an attached client the foreground and clears a foreground that detaches', () => {
  const attached = applyChange(snapshot, { type: 'clientAttached', client: second });

  expect(attached.foregroundClientId).toBe(second.id);

  const detached = applyChange(attached, {
    type: 'clientDetached',
    clientId: second.id,
    reason: 'requested',
  });

  expect(detached.foregroundClientId).toBeUndefined();
});

it('shows the pane of the attached client view, and the default view without a client', () => {
  const ownView = {
    ...first,
    view: { ...withSecond.defaultView, focusedWorkspaceId: workspaceId(1) },
  };

  const next = { ...withSecond, clients: [ownView], attachedClientId: ownView.id };

  expect(viewedPane(next)?.id).toBe(paneId(1));
  expect(focusedPane(next)?.id).toBe(paneId(2));
  expect(viewedPane({ ...next, attachedClientId: undefined })?.id).toBe(paneId(2));
});

it('activates the tab only in the workspace the change names', () => {
  const next = applyChange(withSecond, {
    type: 'tabFocused',
    workspaceId: secondWorkspace.id,
    tabId: tabId(5),
  });

  expect(next.defaultView.activeTabs).toEqual([
    { workspaceId: workspaceId(1), tabId: tabId(1) },
    { workspaceId: secondWorkspace.id, tabId: tabId(5) },
  ]);
});

it('records the state of only the pane the change names', () => {
  const next = applyChange(withSecond, {
    type: 'paneStateChanged',
    paneId: paneId(2),
    lifecycle: 'exited',
    exitCode: 3,
    error: undefined,
  });

  expect(next.panes).toEqual([
    snapshot.panes[0]!,
    { ...secondPane, lifecycle: 'exited', exitCode: 3 },
  ]);
});

it('moves only the pane the change names', () => {
  const next = applyChange(withSecond, { type: 'paneMoved', paneId: paneId(2), tabId: tabId(1) });

  expect(next.panes).toEqual([snapshot.panes[0]!, { ...secondPane, tabId: tabId(1) }]);
  expect(next.tabs).toEqual(withSecond.tabs);
});

it('adds the pane the change names', () => {
  const next = applyChange(snapshot, { type: 'paneAdded', pane: secondPane });

  expect(next.panes).toEqual([...snapshot.panes, secondPane]);
  expect(next.tabs).toEqual(snapshot.tabs);
});

it('resizes only the pane the change names and keeps the rest of it', () => {
  const resized = { columns: 100, rows: 30 };

  const next = applyChange(withSecond, { type: 'paneResized', paneId: paneId(2), size: resized });

  expect(next.panes).toEqual([snapshot.panes[0]!, { ...secondPane, size: resized }]);
});

it('adds a second tab to its workspace and to the tabs', () => {
  const added = { ...secondTab, id: tabId(3), workspaceId: workspaceId(1) };

  const next = applyChange(withSecond, { type: 'tabAdded', tab: added });

  expect(next.tabs).toEqual([...withSecond.tabs, added]);

  expect(next.workspaces.map((workspace) => workspace.tabIds)).toEqual([
    [tabId(1), tabId(3)],
    [tabId(2)],
  ]);
});

it('sets the zoom of only the tab the change names', () => {
  const zoomed = applyChange(withSecond, {
    type: 'tabZoomChanged',
    tabId: tabId(2),
    zoomedPaneId: paneId(2),
  });

  expect(zoomed.tabs.map((tab) => tab.zoomedPaneId)).toEqual([undefined, paneId(2)]);
  expect(zoomed.tabs[1]).toEqual({ ...secondTab, zoomedPaneId: paneId(2) });

  const restored = applyChange(zoomed, {
    type: 'tabZoomChanged',
    tabId: tabId(2),
    zoomedPaneId: undefined,
  });

  expect(restored.tabs).toEqual(withSecond.tabs);
});

it('renames only the tab the change names', () => {
  const next = applyChange(withSecond, { type: 'tabRenamed', tabId: tabId(2), label: 'logs' });

  expect(next.tabs).toEqual([snapshot.tabs[0]!, { ...secondTab, label: 'logs' }]);
});

it('drops a removed tab from its workspace and keeps the other tabs', () => {
  const added = { ...secondTab, workspaceId: workspaceId(1) };

  const withTwoTabs: StoreSnapshot = {
    ...snapshot,
    workspaces: [{ ...snapshot.workspaces[0]!, tabIds: [tabId(1), tabId(2)] }],
    tabs: [...snapshot.tabs, added],
  };

  const next = applyChange(withTwoTabs, { type: 'tabRemoved', tabId: tabId(2) });

  expect(next.tabs).toEqual(snapshot.tabs);
  expect(next.workspaces).toEqual(snapshot.workspaces);
});

it('keeps the clients that stay when the attached client detaches', () => {
  const both: StoreSnapshot = {
    ...snapshot,
    clients: [first, second],
    attachedClientId: first.id,
    foregroundClientId: second.id,
  };

  const next = applyChange(both, {
    type: 'clientDetached',
    clientId: first.id,
    reason: 'requested',
  });

  expect(next.clients).toEqual([second]);
  expect(next.attachedClientId).toBeUndefined();
  expect(next.foregroundClientId).toBe(second.id);
});

it('keeps the attached client when the foreground client detaches', () => {
  const both: StoreSnapshot = {
    ...snapshot,
    clients: [first, second],
    attachedClientId: first.id,
    foregroundClientId: second.id,
  };

  const next = applyChange(both, {
    type: 'clientDetached',
    clientId: second.id,
    reason: 'requested',
  });

  expect(next.clients).toEqual([first]);
  expect(next.attachedClientId).toBe(first.id);
  expect(next.foregroundClientId).toBeUndefined();
});

it('finds no pane while no tab is active', () => {
  const noWorkspace: StoreSnapshot = {
    ...snapshot,
    defaultView: { focusedWorkspaceId: undefined, activeTabs: [], scrolls: [] },
    clients: [],
    attachedClientId: undefined,
  };

  const unknownTab: StoreSnapshot = {
    ...noWorkspace,
    defaultView: {
      focusedWorkspaceId: workspaceId(1),
      activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(9) }],
      scrolls: [],
    },
  };

  for (const empty of [noWorkspace, unknownTab]) {
    expect(focusedPane(empty)).toBeUndefined();
    expect(viewedPane(empty)).toBeUndefined();
  }
});

it('gives the scroll row of the pane it names', () => {
  const scrolled = {
    ...view,
    scrolls: [
      { paneId: paneId(1), topRow: 7 },
      { paneId: paneId(2), topRow: 9 },
    ],
  };

  expect(scrollTopOf(scrolled, paneId(1))).toBe(7);
  expect(scrollTopOf(scrolled, paneId(2))).toBe(9);
  expect(scrollTopOf(scrolled, paneId(3))).toBeUndefined();
});

it('gives the active tab of the workspace it names', () => {
  expect(activeTabIdOf(withSecond.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(activeTabIdOf(withSecond.defaultView, secondWorkspace.id)).toBe(tabId(2));
  expect(activeTabIdOf(withSecond.defaultView, workspaceId(3))).toBeUndefined();
  expect(activeTabIdOf(withSecond.defaultView, undefined)).toBeUndefined();
});

describe('shownPaneIds', () => {
  const splitTab = {
    ...snapshot.tabs[0]!,
    layout: {
      kind: 'split' as const,
      direction: 'right' as const,
      ratio: 0.5,
      first: { kind: 'pane' as const, paneId: paneId(1) },
      second: {
        kind: 'split' as const,
        direction: 'below' as const,
        ratio: 0.5,
        first: { kind: 'pane' as const, paneId: paneId(3) },
        second: { kind: 'pane' as const, paneId: paneId(4) },
      },
    },
  };

  const placed: StoreSnapshot = {
    ...withSecond,
    tabs: [splitTab, secondTab],
    clients: [],
    attachedClientId: undefined,
  };

  const focusing = (id: WorkspaceId): StoreSnapshot => ({
    ...placed,
    defaultView: { ...placed.defaultView, focusedWorkspaceId: id },
  });

  it('lists every pane the layout of the shown tab places', () => {
    expect(shownPaneIds(focusing(workspaceId(1)))).toEqual(
      new Set([paneId(1), paneId(3), paneId(4)]),
    );
  });

  it('lists the one pane of a single-pane layout', () => {
    expect(shownPaneIds(focusing(secondWorkspace.id))).toEqual(new Set([paneId(2)]));
  });

  it('lists only the zoomed pane', () => {
    const zoomed = {
      ...focusing(workspaceId(1)),
      tabs: [{ ...splitTab, zoomedPaneId: paneId(3) }, secondTab],
    };

    expect(shownPaneIds(zoomed)).toEqual(new Set([paneId(3)]));
  });

  it('lists the tab the attached client shows', () => {
    const ownView = {
      ...first,
      view: { ...placed.defaultView, focusedWorkspaceId: workspaceId(1) },
    };

    const attached = { ...placed, clients: [ownView], attachedClientId: ownView.id };

    expect(shownPaneIds(attached)).toEqual(new Set([paneId(1), paneId(3), paneId(4)]));
  });

  it('lists no pane while no tab is shown', () => {
    expect(shownPaneIds(focusing(workspaceId(3)))).toEqual(new Set());
  });
});

it('keeps every pane as it is when a pane is focused', () => {
  const next = applyChange(withSecond, { type: 'paneFocused', tabId: tabId(2), paneId: paneId(2) });

  expect(next.panes).toEqual(withSecond.panes);
});
