import { describe, expect, it } from 'bun:test';

import { actionCatalog, availableActions, paneCommandOf } from './actions.ts';
import type { StoreSnapshot } from './client/client.ts';
import { clientId, paneId, tabId, workspaceId } from './ids.ts';
import { legacyArrangement } from './layout.ts';

type Layout = StoreSnapshot['tabs'][number]['layout'];

interface TabShape {
  id: number;
  workspace: number;
  panes: number[];
  focused: number;
  // Without it the tab is legacy with the order of its tree.
  arrangement?: { choice: 'legacy' | 'master'; order: number[] };
}

interface Shape {
  workspaces: number[];
  tabs: TabShape[];
}

const size = { columns: 80, rows: 24 };

const rowLayout = (panes: readonly number[]): Layout => {
  const [first, ...rest] = panes;

  if (first === undefined) {
    throw new Error('a tab holds a pane');
  }

  if (rest.length === 0) {
    return { kind: 'pane', paneId: paneId(first) };
  }

  return {
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: { kind: 'pane', paneId: paneId(first) },
    second: rowLayout(rest),
  };
};

const snapshotOf = (shape: Shape): StoreSnapshot => {
  const [shown] = shape.workspaces;

  const view = {
    focusedWorkspaceId: shown === undefined ? undefined : workspaceId(shown),
    activeTabs: shape.workspaces.flatMap((workspace) => {
      const tab = shape.tabs.find((known) => known.workspace === workspace);

      return tab === undefined
        ? []
        : [{ workspaceId: workspaceId(workspace), tabId: tabId(tab.id) }];
    }),
    scrolls: [],
  };

  return {
    revision: 1,
    workspaces: shape.workspaces.map((workspace) => ({
      id: workspaceId(workspace),
      root: '/work',
      label: 'koja',
      tabIds: shape.tabs.filter((tab) => tab.workspace === workspace).map((tab) => tabId(tab.id)),
    })),
    tabs: shape.tabs.map((tab) => ({
      id: tabId(tab.id),
      workspaceId: workspaceId(tab.workspace),
      layout: rowLayout(tab.panes),
      arrangement:
        tab.arrangement === undefined
          ? legacyArrangement(rowLayout(tab.panes))
          : { choice: tab.arrangement.choice, order: tab.arrangement.order.map(paneId) },
      focusedPaneId: paneId(tab.focused),
      zoomedPaneId: undefined,
      label: undefined,
    })),
    panes: shape.tabs.flatMap((tab) =>
      tab.panes.map((pane) => ({
        id: paneId(pane),
        tabId: tabId(tab.id),
        lifecycle: 'running' as const,
        generation: 1,
        size,
        exitCode: undefined,
        startFolder: undefined,
        restored: false,
        error: undefined,
      })),
    ),
    defaultView: view,
    attachedClientId: clientId(1),
    foregroundClientId: clientId(1),
    clients: [{ id: clientId(1), size, theme: undefined, view }],
  };
};

const onePane: Shape = { workspaces: [1], tabs: [{ id: 1, workspace: 1, panes: [1], focused: 1 }] };

const twoPanes: Shape = {
  workspaces: [1],
  tabs: [{ id: 1, workspace: 1, panes: [1, 2], focused: 1 }],
};

const twoTabs: Shape = {
  workspaces: [1],
  tabs: [
    { id: 1, workspace: 1, panes: [1], focused: 1 },
    { id: 2, workspace: 1, panes: [2], focused: 2 },
  ],
};

const twoWorkspaces: Shape = {
  workspaces: [1, 2],
  tabs: [
    { id: 1, workspace: 1, panes: [1], focused: 1 },
    { id: 2, workspace: 2, panes: [2], focused: 2 },
  ],
};

const noPanes: Shape = { workspaces: [], tabs: [] };

const isAvailable = (id: string, shape: Shape): boolean =>
  availableActions(actionCatalog, snapshotOf(shape)).some((entry) => entry.id === id);

const paneActionIds = [
  'pane.add',
  'pane.splitBelow',
  'pane.splitRight',
  'pane.close',
  'pane.breakPane',
  'pane.zoom',
  'pane.resizeLeft',
  'pane.resizeRight',
  'pane.resizeUp',
  'pane.resizeDown',
];

describe('action catalog', () => {
  it('binds each key to one action', () => {
    const keys = actionCatalog.flatMap((entry) => entry.keys);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('action availability', () => {
  it('needs a viewed pane for every pane action', () => {
    for (const id of paneActionIds) {
      expect(isAvailable(id, noPanes)).toBe(false);
      expect(isAvailable(id, onePane)).toBe(true);
    }
  });

  it('needs a pane after the viewed one for focus next', () => {
    expect(isAvailable('pane.focusNext', onePane)).toBe(false);
    expect(isAvailable('pane.focusNext', twoPanes)).toBe(true);
  });

  it('needs a pane before the viewed one for focus previous', () => {
    expect(isAvailable('pane.focusPrevious', onePane)).toBe(false);
    expect(isAvailable('pane.focusPrevious', twoPanes)).toBe(false);

    const secondPaneShown: Shape = {
      workspaces: [1],
      tabs: [{ id: 1, workspace: 1, panes: [1, 2], focused: 2 }],
    };

    expect(isAvailable('pane.focusPrevious', secondPaneShown)).toBe(true);
  });

  it('offers each layout switch only to a tab in the other layout', () => {
    const master: Shape = {
      workspaces: [1],
      tabs: [
        {
          id: 1,
          workspace: 1,
          panes: [1],
          focused: 1,
          arrangement: { choice: 'master', order: [1] },
        },
      ],
    };

    const masterShownAfterLegacy: Shape = {
      workspaces: [2, 1],
      tabs: [
        { id: 1, workspace: 1, panes: [1], focused: 1 },
        {
          id: 2,
          workspace: 2,
          panes: [2],
          focused: 2,
          arrangement: { choice: 'master', order: [2] },
        },
      ],
    };

    expect(isAvailable('layout.master', onePane)).toBe(true);
    expect(isAvailable('layout.legacy', onePane)).toBe(false);
    expect(isAvailable('layout.master', master)).toBe(false);
    expect(isAvailable('layout.legacy', master)).toBe(true);
    expect(isAvailable('layout.master', masterShownAfterLegacy)).toBe(false);
    expect(isAvailable('layout.legacy', masterShownAfterLegacy)).toBe(true);
    expect(isAvailable('layout.master', noPanes)).toBe(false);
    expect(isAvailable('layout.legacy', noPanes)).toBe(false);
  });

  it('needs more than one tab for tab next and previous', () => {
    expect(isAvailable('tab.next', onePane)).toBe(false);
    expect(isAvailable('tab.previous', onePane)).toBe(false);
    expect(isAvailable('tab.next', twoTabs)).toBe(true);
    expect(isAvailable('tab.previous', twoTabs)).toBe(true);
  });

  it('needs more than one workspace for workspace next and previous', () => {
    expect(isAvailable('workspace.next', onePane)).toBe(false);
    expect(isAvailable('workspace.previous', onePane)).toBe(false);
    expect(isAvailable('workspace.next', twoWorkspaces)).toBe(true);
    expect(isAvailable('workspace.previous', twoWorkspaces)).toBe(true);
  });

  it('needs a shown workspace for workspace close and tab create', () => {
    expect(isAvailable('workspace.close', noPanes)).toBe(false);
    expect(isAvailable('tab.create', noPanes)).toBe(false);
    expect(isAvailable('workspace.close', onePane)).toBe(true);
    expect(isAvailable('tab.create', onePane)).toBe(true);
  });

  it('offers workspace create without a workspace', () => {
    expect(isAvailable('workspace.create', noPanes)).toBe(true);
  });

  it('needs tab N in the shown workspace for tab focus N', () => {
    expect(isAvailable('tab.focus-1', onePane)).toBe(true);
    expect(isAvailable('tab.focus-2', onePane)).toBe(false);
    expect(isAvailable('tab.focus-2', twoTabs)).toBe(true);
    expect(isAvailable('tab.focus-3', twoTabs)).toBe(false);
  });
});

describe('pane focus order', () => {
  const masterTab: Shape = {
    workspaces: [1],
    tabs: [
      {
        id: 1,
        workspace: 1,
        panes: [1, 2, 3],
        focused: 3,
        arrangement: { choice: 'master', order: [3, 1, 2] },
      },
    ],
  };

  it('steps through the arrangement order in a master tab', () => {
    const snapshot = snapshotOf(masterTab);

    expect(paneCommandOf(snapshot, paneId(3), 'focusNext')).toEqual({
      action: 'focus',
      pane: paneId(1),
    });

    expect(paneCommandOf(snapshot, paneId(3), 'focusPrevious')).toBeUndefined();

    expect(paneCommandOf(snapshot, paneId(2), 'focusPrevious')).toEqual({
      action: 'focus',
      pane: paneId(1),
    });
  });

  it('steps through the split tree order in a legacy tab, whatever its saved order', () => {
    const snapshot = snapshotOf({
      workspaces: [1],
      tabs: [
        {
          id: 1,
          workspace: 1,
          panes: [1, 2, 3],
          focused: 3,
          arrangement: { choice: 'legacy', order: [3, 1, 2] },
        },
      ],
    });

    expect(paneCommandOf(snapshot, paneId(1), 'focusNext')).toEqual({
      action: 'focus',
      pane: paneId(2),
    });

    expect(paneCommandOf(snapshot, paneId(3), 'focusNext')).toBeUndefined();
  });

  it('adds a pane next to the given pane with the new pane action', () => {
    expect(paneCommandOf(snapshotOf(masterTab), paneId(1), 'add')).toEqual({
      action: 'add',
      pane: paneId(1),
      cwd: undefined,
    });
  });
});
