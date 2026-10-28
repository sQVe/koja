import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import { applyIntent, createState, savedSessionOf } from './store.ts';
import type { Intent, State } from './store.ts';
import {
  addPane,
  attachLarge,
  attachedEmpty,
  createApi,
  createDocs,
  createKoja,
  defined,
  fact,
  intent,
  noReads,
  richSession,
  run,
  runLegacy,
  splitFirst,
  switchLayout,
} from './storeFixtures.ts';

const restoreIntent = (state: State): Intent => ({
  type: 'restoreSession',
  session: savedSessionOf(state, noReads),
});

const failRestoredSecondPane = () => {
  const restored = intent(createState(), restoreIntent(run([createKoja, createDocs]))).state;
  const [, second] = restored.panes;

  const result = fact(restored, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: second?.generation ?? 0,
    message: 'Cannot start /bin/missing',
  });

  return { restored, result };
};

it('restores a saved session with its ids, focus, and zoom', () => {
  const saved = runLegacy(richSession);
  const result = intent(attachedEmpty(), restoreIntent(saved));

  expect(savedSessionOf(result.state, noReads)).toEqual(savedSessionOf(saved, noReads));
  expect(result.state.panes).toHaveLength(4);
  expect(result.state.panes.every((pane) => pane.lifecycle === 'starting')).toBe(true);
  expect(result.state.tabs.some((tab) => tab.zoomedPaneId === paneId(4))).toBe(true);
});

it('adds one paneAdded change per restored pane', () => {
  const result = intent(attachedEmpty(), restoreIntent(runLegacy(richSession)));

  const added = result.changes.flatMap((change) =>
    change.type === 'paneAdded' ? [change.pane] : [],
  );

  expect(added).toEqual([...result.state.panes]);
  expect(result.state.revision).toBe(1 + result.changes.length);
  expect(new Set(added.map((pane) => pane.generation)).size).toBe(4);
});

it('refuses to restore into a state that has a workspace', () => {
  const state = runLegacy([createKoja]);

  expect(applyIntent(state, restoreIntent(runLegacy(richSession)))).toEqual({
    kind: 'rejected',
    state,
    reason: 'sessionNotEmpty',
  });
});

it('refuses to restore while the server stops', () => {
  const state = runLegacy([{ type: 'stopServer' }]);

  expect(applyIntent(state, restoreIntent(runLegacy(richSession)))).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

it('gives ids above the restored ones to a workspace created after a restore', () => {
  const restored = intent(createState(), restoreIntent(runLegacy(richSession))).state;
  const result = intent(restored, createApi);

  const added = result.changes.flatMap((change) =>
    change.type === 'paneAdded' ? [change.pane] : [],
  );

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([
    workspaceId(1),
    workspaceId(2),
    workspaceId(3),
  ]);

  expect(added.map((pane) => pane.id)).toEqual([paneId(5)]);
  expect(added.map((pane) => pane.tabId)).toEqual([tabId(4)]);
});

it('keeps a restored pane that fails to start, with its error', () => {
  const { restored, result } = failRestoredSecondPane();
  const failed = result.state.panes.find((pane) => pane.id === paneId(2));

  expect(failed?.lifecycle).toBe('failed');
  expect(failed?.error).toBe('Cannot start /bin/missing');
  expect(result.state.workspaces).toEqual(restored.workspaces);
  expect(result.state.tabs).toEqual(restored.tabs);

  expect(result.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(2),
      lifecycle: 'failed',
      exitCode: undefined,
      error: 'Cannot start /bin/missing',
    },
  ]);
});

it('removes a failed pane when it is closed, and saves it until then', () => {
  const { result } = failRestoredSecondPane();
  const saved = savedSessionOf(result.state, noReads);

  expect(saved.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);

  const closed = intent(result.state, { type: 'closePane', paneId: paneId(2) });

  expect(closed.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(closed.changes.map((change) => change.type)).toContain('paneRemoved');
});

it('gives restored panes consecutive generations and moves the counter past them', () => {
  const result = intent(attachedEmpty(), restoreIntent(runLegacy(richSession)));

  expect(result.state.panes.map((pane) => pane.generation)).toEqual([1, 2, 3, 4]);
  expect(result.state.nextGeneration).toBe(5);
});

it('reports every restored workspace, tab, and pane, and the view of the attached client', () => {
  const saved = run([createKoja, createDocs]);
  const result = intent(attachedEmpty(), restoreIntent(saved));
  const { workspaces, tabs, panes, defaultView } = result.state;

  expect(workspaces).toEqual(saved.workspaces);

  expect(result.changes).toEqual([
    {
      type: 'workspaceAdded',
      workspace: defined(saved.workspaces[0]),
      activeTabId: tabId(1),
      focusedWorkspaceId: workspaceId(2),
    },
    {
      type: 'workspaceAdded',
      workspace: defined(saved.workspaces[1]),
      activeTabId: tabId(2),
      focusedWorkspaceId: workspaceId(2),
    },
    { type: 'tabAdded', tab: defined(tabs[0]) },
    { type: 'tabAdded', tab: defined(tabs[1]) },
    { type: 'paneAdded', pane: defined(panes[0]) },
    { type: 'paneAdded', pane: defined(panes[1]) },
    { type: 'clientViewChanged', clientId: clientId(1), view: defaultView },
  ]);
});

it('starts the default view and the view of an attached client without scrolls', () => {
  const result = intent(attachedEmpty(), restoreIntent(run([createKoja, createDocs])));

  expect(result.state.defaultView.scrolls).toEqual([]);
  expect(result.state.clients[0]?.view).toEqual(result.state.defaultView);
});

it('stops the server without touching a restored pane that failed to start', () => {
  const { result } = failRestoredSecondPane();
  const stopped = intent(result.state, { type: 'stopServer' });

  expect(stopped.state.panes.map((pane) => pane.lifecycle)).toEqual(['closing', 'failed']);

  expect(stopped.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(1),
      lifecycle: 'closing',
      exitCode: undefined,
      error: undefined,
    },
    { type: 'serverStopping' },
  ]);
});

it('restores a master tab without room with lone pane sizes', () => {
  const saved = runLegacy([
    createKoja,
    attachLarge,
    splitFirst('right'),
    addPane(1),
    switchLayout(1, 'master'),
  ]);

  const tiny = runLegacy([{ type: 'attachClient', size: { columns: 6, rows: 3 } }]);
  const result = intent(tiny, restoreIntent(saved));

  expect(result.state.tabs[0]?.arrangement.choice).toBe('master');

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 6, rows: 2 },
    { columns: 6, rows: 2 },
    { columns: 6, rows: 2 },
  ]);
});
