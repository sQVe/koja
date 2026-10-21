import { describe, expect, it } from 'bun:test';

import type { StoreSnapshot } from '../client/client.ts';
import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { runPaneAction } from './paneActions.ts';
import type { PaneAction } from './paneActions.ts';

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
  let layout: StoreSnapshot['tabs'][number]['layout'] = { kind: 'pane', paneId: paneId(1) };

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
    workspaces: [{ id: workspaceId(1), root: '/work/koja', label: 'koja', tabIds: [tabId(1)] }],
    tabs: [
      {
        id: tabId(1),
        workspaceId: workspaceId(1),
        layout,
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

const emptySnapshot: StoreSnapshot = { ...snapshotWith(1, 1), workspaces: [], tabs: [], panes: [] };

const fakeSession = (snapshot: StoreSnapshot) => {
  const calls: unknown[][] = [];

  const record =
    (name: string) =>
    (...args: unknown[]): Promise<void> => {
      calls.push([name, ...args]);

      return Promise.resolve();
    };

  const session = {
    getState: () => ({ snapshot, inputMode: 'normal' as const }),
    splitPane: record('splitPane'),
    focusPane: record('focusPane'),
    closePane: record('closePane'),
    movePane: record('movePane'),
    zoomPane: record('zoomPane'),
    resizePane: record('resizePane'),
  };

  return { session, calls };
};

const run = async (snapshot: StoreSnapshot, action: PaneAction): Promise<readonly unknown[][]> => {
  const { session, calls } = fakeSession(snapshot);

  await runPaneAction(session, action);

  return calls;
};

const pane = (id: number): PaneId => paneId(id);

describe('runPaneAction', () => {
  it('focuses the next pane in layout order', async () => {
    expect(await run(snapshotWith(1, 2), 'focusNext')).toEqual([['focusPane', pane(2)]]);
  });

  it('focuses the previous pane in layout order', async () => {
    expect(await run(snapshotWith(2, 2), 'focusPrevious')).toEqual([['focusPane', pane(1)]]);
  });

  it('sends nothing past the last pane', async () => {
    expect(await run(snapshotWith(2, 2), 'focusNext')).toEqual([]);
  });

  it('sends nothing before the first pane', async () => {
    expect(await run(snapshotWith(1, 2), 'focusPrevious')).toEqual([]);
  });

  it('splits the viewed pane below', async () => {
    expect(await run(snapshotWith(1, 1), 'splitBelow')).toEqual([['splitPane', pane(1), 'below']]);
  });

  it('splits the viewed pane to the right', async () => {
    expect(await run(snapshotWith(1, 1), 'splitRight')).toEqual([['splitPane', pane(1), 'right']]);
  });

  it('closes the viewed pane', async () => {
    expect(await run(snapshotWith(1, 1), 'close')).toEqual([['closePane', pane(1)]]);
  });

  it('breaks the viewed pane into a new tab', async () => {
    expect(await run(snapshotWith(1, 1), 'breakPane')).toEqual([
      ['movePane', pane(1), { kind: 'newTab' }],
    ]);
  });

  it('zooms the viewed pane', async () => {
    expect(await run(snapshotWith(1, 1), 'zoom')).toEqual([['zoomPane', pane(1)]]);
  });

  it.each([
    ['resizeLeft', 'left'],
    ['resizeRight', 'right'],
    ['resizeUp', 'up'],
    ['resizeDown', 'down'],
  ] as const)('resizes the viewed pane by one cell for %s', async (action, direction) => {
    expect(await run(snapshotWith(1, 1), action)).toEqual([['resizePane', pane(1), direction, 1]]);
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
