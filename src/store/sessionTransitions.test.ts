import { expect, it } from 'bun:test';

import { paneId, tabId, workspaceId } from '../ids.ts';
import { applyIntent, createState, savedSessionOf } from './store.ts';
import type { Intent, State } from './store.ts';
import {
  attachedEmpty,
  createApi,
  createDocs,
  createPhi,
  fact,
  intent,
  noFolders,
  richSession,
  run,
} from './storeFixtures.ts';

const restoreIntent = (state: State): Intent => ({
  type: 'restoreSession',
  session: savedSessionOf(state, noFolders),
});

const failRestoredSecondPane = () => {
  const restored = intent(createState(), restoreIntent(run([createPhi, createDocs]))).state;
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
  const saved = run(richSession);
  const result = intent(attachedEmpty(), restoreIntent(saved));

  expect(savedSessionOf(result.state, noFolders)).toEqual(savedSessionOf(saved, noFolders));
  expect(result.state.panes).toHaveLength(4);
  expect(result.state.panes.every((pane) => pane.lifecycle === 'starting')).toBe(true);
  expect(result.state.tabs.some((tab) => tab.zoomedPaneId === paneId(4))).toBe(true);
});

it('adds one paneAdded change per restored pane', () => {
  const result = intent(attachedEmpty(), restoreIntent(run(richSession)));

  const added = result.changes.flatMap((change) =>
    change.type === 'paneAdded' ? [change.pane] : [],
  );

  expect(added).toEqual([...result.state.panes]);
  expect(result.state.revision).toBe(1 + result.changes.length);
  expect(new Set(added.map((pane) => pane.generation)).size).toBe(4);
});

it('refuses to restore into a state that has a workspace', () => {
  const state = run([createPhi]);

  expect(applyIntent(state, restoreIntent(run(richSession)))).toEqual({
    kind: 'rejected',
    state,
    reason: 'sessionNotEmpty',
  });
});

it('refuses to restore while the server stops', () => {
  const state = run([{ type: 'stopServer' }]);

  expect(applyIntent(state, restoreIntent(run(richSession)))).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

it('gives ids above the restored ones to a workspace created after a restore', () => {
  const restored = intent(createState(), restoreIntent(run(richSession))).state;
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
  const saved = savedSessionOf(result.state, noFolders);

  expect(saved.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);

  const closed = intent(result.state, { type: 'closePane', paneId: paneId(2) });

  expect(closed.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(closed.changes.map((change) => change.type)).toContain('paneRemoved');
});
