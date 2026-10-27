import { describe, expect, it } from 'bun:test';

import type { PaneAction } from '../actions.ts';
import type { PaneLayoutCommand, StoreSnapshot } from '../client/client.ts';
import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { legacyArrangement } from '../layout.ts';
import { runPaneAction } from './paneActions.ts';

const size = { columns: 80, rows: 24 };

const view = {
  focusedWorkspaceId: workspaceId(1),
  activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(1) }],
  scrolls: [],
};

const client = { id: clientId(1), size, theme: undefined, view };

const paneOf = (id: number): StoreSnapshot['panes'][number] => ({
  id: paneId(id),
  tabId: tabId(1),
  lifecycle: 'running',
  generation: 1,
  size,
  exitCode: undefined,
  startFolder: undefined,
  restored: false,
  error: undefined,
});

const snapshotWith = (focused: number, paneCount: number): StoreSnapshot => {
  let layout: StoreSnapshot['tabs'][number]['layout'] = {
    kind: 'pane',
    paneId: paneId(1),
  };

  for (let id = 2; id <= paneCount; id += 1) {
    layout = {
      kind: 'split',
      direction: 'right',
      ratio: 0.5,
      first: layout,
      second: { kind: 'pane', paneId: paneId(id) },
    };
  }

  return {
    revision: 1,
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
        layout,
        arrangement: legacyArrangement(layout),
        focusedPaneId: paneId(focused),
        zoomedPaneId: undefined,
        label: undefined,
      },
    ],
    panes: Array.from({ length: paneCount }, (_, index) => paneOf(index + 1)),
    defaultView: view,
    attachedClientId: client.id,
    foregroundClientId: client.id,
    clients: [client],
  };
};

const emptySnapshot: StoreSnapshot = {
  ...snapshotWith(1, 1),
  workspaces: [],
  tabs: [],
  panes: [],
};

const fakeSession = (snapshot: StoreSnapshot) => {
  const commands: PaneLayoutCommand[] = [];

  const session = {
    getState: () => ({ snapshot, inputMode: 'normal' as const }),
    changePaneLayout: (command: PaneLayoutCommand): Promise<void> => {
      commands.push(command);

      return Promise.resolve();
    },
  };

  return { session, commands };
};

const run = async (
  snapshot: StoreSnapshot,
  action: PaneAction,
): Promise<readonly PaneLayoutCommand[]> => {
  const { session, commands } = fakeSession(snapshot);

  await runPaneAction(session, action);

  return commands;
};

const pane = (id: number): PaneId => paneId(id);

const secondTabSnapshot = (): StoreSnapshot => {
  const base = snapshotWith(3, 3);
  const [firstTab] = base.tabs;

  if (firstTab === undefined) {
    throw new Error('fixture has a tab');
  }

  const otherView = {
    ...view,
    activeTabs: [{ workspaceId: workspaceId(1), tabId: tabId(2) }],
  };

  return {
    ...base,
    workspaces: [
      {
        id: workspaceId(1),
        root: '/work',
        label: 'koja',
        tabIds: [tabId(1), tabId(2)],
      },
    ],
    tabs: [
      {
        ...firstTab,
        layout: { kind: 'pane', paneId: paneId(1) },
        focusedPaneId: paneId(1),
      },
      {
        ...firstTab,
        id: tabId(2),
        layout: {
          kind: 'split',
          direction: 'right',
          ratio: 0.5,
          first: { kind: 'pane', paneId: paneId(2) },
          second: { kind: 'pane', paneId: paneId(3) },
        },
        focusedPaneId: paneId(2),
      },
    ],
    panes: [paneOf(1), { ...paneOf(2), tabId: tabId(2) }, { ...paneOf(3), tabId: tabId(2) }],
    defaultView: otherView,
    clients: [{ ...client, view: otherView }],
  };
};

describe('runPaneAction', () => {
  it('sends nothing when the tab of the viewed pane is unknown', async () => {
    const base = snapshotWith(1, 2);

    const orphaned = {
      ...base,
      panes: base.panes.map((known) => Object.assign({}, known, { tabId: tabId(9) })),
    };

    expect(await run(orphaned, 'focusNext')).toEqual([]);
  });

  it('moves focus within the tab of the viewed pane', async () => {
    expect(await run(secondTabSnapshot(), 'focusNext')).toEqual([
      { action: 'focus', pane: pane(3) },
    ]);
  });

  it('focuses the next pane in layout order', async () => {
    expect(await run(snapshotWith(1, 2), 'focusNext')).toEqual([
      { action: 'focus', pane: pane(2) },
    ]);
  });

  it('focuses the previous pane in layout order', async () => {
    expect(await run(snapshotWith(2, 2), 'focusPrevious')).toEqual([
      { action: 'focus', pane: pane(1) },
    ]);
  });

  it('sends nothing past the last pane', async () => {
    expect(await run(snapshotWith(2, 2), 'focusNext')).toEqual([]);
  });

  it('sends nothing before the first pane', async () => {
    expect(await run(snapshotWith(1, 2), 'focusPrevious')).toEqual([]);
  });

  it('splits the viewed pane below', async () => {
    expect(await run(snapshotWith(1, 1), 'splitBelow')).toEqual([
      { action: 'split', pane: pane(1), direction: 'below', cwd: undefined },
    ]);
  });

  it('splits the viewed pane to the right', async () => {
    expect(await run(snapshotWith(1, 1), 'splitRight')).toEqual([
      { action: 'split', pane: pane(1), direction: 'right', cwd: undefined },
    ]);
  });

  it('closes the viewed pane', async () => {
    expect(await run(snapshotWith(1, 1), 'close')).toEqual([{ action: 'close', pane: pane(1) }]);
  });

  it('breaks the viewed pane into a new tab', async () => {
    expect(await run(snapshotWith(1, 1), 'breakPane')).toEqual([
      { action: 'move', pane: pane(1), destination: { kind: 'newTab' } },
    ]);
  });

  it('zooms the viewed pane', async () => {
    expect(await run(snapshotWith(1, 1), 'zoom')).toEqual([{ action: 'zoom', pane: pane(1) }]);
  });

  it.each([
    ['resizeLeft', 'left'],
    ['resizeRight', 'right'],
    ['resizeUp', 'up'],
    ['resizeDown', 'down'],
  ] as const)('resizes the viewed pane by one cell for %s', async (action, direction) => {
    expect(await run(snapshotWith(1, 1), action)).toEqual([
      { action: 'resize', pane: pane(1), direction, cells: 1 },
    ]);
  });

  it.each([
    'splitBelow',
    'splitRight',
    'focusPrevious',
    'focusNext',
    'close',
    'breakPane',
    'zoom',
    'resizeLeft',
  ] as const)('sends nothing for %s without a viewed pane', async (action) => {
    expect(await run(emptySnapshot, action)).toEqual([]);
  });
});
