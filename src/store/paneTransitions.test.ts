import { expect, it } from 'bun:test';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import type { Arrangement } from '../layout.ts';
import {
  activeTabOf,
  applyFact,
  applyIntent,
  createState,
  focusedPane,
  savedSessionOf,
} from './store.ts';
import type { Fact, Ignored, Intent, State } from './store.ts';
import {
  attachLarge,
  createDocs,
  createKoja,
  createTab,
  defined,
  fact,
  intent,
  noFolders,
  resize,
  run,
  splitFirst,
  zoom,
} from './storeFixtures.ts';

const firstPane = { paneId: paneId(1), generation: 1 };

const startedPane = (id: number, generation: number): Fact => ({
  type: 'paneStarted',
  paneId: paneId(id),
  generation,
});

const tinyClient: Intent = { type: 'attachClient', size: { columns: 2, rows: 3 } };

const sizes = (state: State): Map<PaneId, string> =>
  new Map(state.panes.map((pane) => [pane.id, `${pane.size.columns}x${pane.size.rows}`]));

const splitPaneOf = (id: number, direction: 'below' | 'right'): Intent => ({
  type: 'splitPane',
  paneId: paneId(id),
  direction,
  folder: undefined,
});

const nestedState = (): State =>
  run([createKoja, attachLarge, splitFirst('right'), splitPaneOf(1, 'below')]);

it('ignores the exit of a pane that a closed workspace removed, and names it for disposal', () => {
  const state = run([createKoja, { type: 'closeWorkspace', workspaceId: workspaceId(1) }]);
  const result = applyFact(state, { type: 'paneExited', ...firstPane, exitCode: 0 });

  expect(result).toEqual({ kind: 'ignored', state, dispose: firstPane });
});

it('refuses to start a pane while the server stops and leaves state unchanged', () => {
  const state = run([{ type: 'stopServer' }]);
  const result = applyIntent(state, createKoja);

  expect(result).toEqual({ kind: 'rejected', state, reason: 'serverStopping' });
  expect(result.state.revision).toBe(state.revision);
});

it('closes the pane and reports that the server should stop once', () => {
  const state = run([createKoja]);
  const stopped = intent(state, { type: 'stopServer' });

  expect(stopped.state.panes[0]?.lifecycle).toBe('closing');

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

  expect(intent(stopped.state, { type: 'stopServer' }).changes).toEqual([]);
});

it('marks a started pane as running', () => {
  const state = run([createKoja]);
  const result = fact(state, { type: 'paneStarted', ...firstPane });

  expect(result.state.panes[0]?.lifecycle).toBe('running');

  expect(result.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(1),
      lifecycle: 'running',
      exitCode: undefined,
      error: undefined,
    },
  ]);
});

it('ignores a fact from an older generation and names the process to dispose', () => {
  const started = run([createKoja]);
  const pane = started.panes[0];

  expect(pane).toBeDefined();

  const state: State = { ...started, panes: pane ? [{ ...pane, generation: 2 }] : [] };
  const result = applyFact(state, { type: 'paneStarted', ...firstPane });

  expect(result).toEqual({ kind: 'ignored', state, dispose: firstPane } satisfies Ignored);
  expect(result.state.revision).toBe(state.revision);
});

it('ignores a pane that starts after the server began to stop, and names it for disposal', () => {
  const state = run([createKoja, { type: 'stopServer' }]);
  const result = applyFact(state, { type: 'paneStarted', ...firstPane });

  expect(result).toEqual({ kind: 'ignored', state, dispose: firstPane });
});

it('removes the pane, tab, and workspace of the only pane that exits, and keeps running', () => {
  const state = fact(run([createKoja]), { type: 'paneStarted', ...firstPane }).state;
  const result = fact(state, { type: 'paneExited', ...firstPane, exitCode: 3 });

  expect(result.state.panes).toEqual([]);
  expect(result.state.tabs).toEqual([]);
  expect(result.state.workspaces).toEqual([]);
  expect(result.state.defaultView.focusedWorkspaceId).toBeUndefined();
  expect(result.state.stopping).toBe(false);

  expect(result.changes).toEqual([
    { type: 'paneRemoved', paneId: paneId(1) },
    { type: 'tabRemoved', tabId: tabId(1) },
    { type: 'workspaceRemoved', workspaceId: workspaceId(1), focusedWorkspaceId: undefined },
  ]);
});

it('removes the workspace of a pane that fails to start, and keeps running', () => {
  const result = fact(run([createKoja]), {
    type: 'paneFailedToStart',
    ...firstPane,
    message: 'no shell',
  });

  expect(result.state.workspaces).toEqual([]);
  expect(result.state.panes).toEqual([]);
  expect(result.state.stopping).toBe(false);
  expect(result.changes.some((change) => change.type === 'serverStopping')).toBe(false);
});

it('keeps the other workspaces when one pane exits', () => {
  const state = run([createKoja, createDocs]);
  const result = fact(state, { type: 'paneExited', ...firstPane, exitCode: 0 });

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(2)]);
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

it('marks a closing pane exited without removing it while the server stops', () => {
  const state = run([createKoja, { type: 'stopServer' }]);
  const result = fact(state, { type: 'paneExited', ...firstPane, exitCode: 0 });

  expect(result.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(1),
      lifecycle: 'exited',
      exitCode: 0,
      error: undefined,
    },
  ]);
});

it('splits a pane at half its area, starts the new pane, and focuses it', () => {
  const state = run([createKoja, attachLarge]);
  const result = intent(state, splitFirst('right'));
  const added = result.state.panes[1];

  expect(added).toEqual({
    id: paneId(2),
    tabId: tabId(1),
    lifecycle: 'starting',
    size: { columns: 38, rows: 22 },
    generation: 2,
    exitCode: undefined,
    startFolder: undefined,
    restored: false,
    error: undefined,
  });

  expect(result.state.panes[0]?.size).toEqual({ columns: 38, rows: 22 });
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));

  expect(result.state.tabs[0]?.layout).toEqual({
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: { kind: 'pane', paneId: paneId(1) },
    second: { kind: 'pane', paneId: paneId(2) },
  });

  expect(result.changes.map((change) => change.type)).toEqual([
    'paneAdded',
    'tabLayoutChanged',
    'paneFocused',
    'paneResized',
  ]);
});

it('splits the focused pane below and gives each pane half the rows', () => {
  const result = intent(run([createKoja, attachLarge]), splitFirst('below'));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 79, rows: 10 },
    { columns: 79, rows: 10 },
  ]);
});

it('splits a pane inside a split at half the area of that pane', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);

  const result = intent(state, {
    type: 'splitPane',
    paneId: paneId(2),
    direction: 'below',
    folder: undefined,
  });

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 38, rows: 22 },
    { columns: 38, rows: 10 },
    { columns: 38, rows: 10 },
  ]);
});

it('gives the area and the focus of a closed pane to its sibling', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);
  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(result.state.tabs[0]?.layout).toEqual({ kind: 'pane', paneId: paneId(1) });
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(result.state.panes[0]?.size).toEqual({ columns: 81, rows: 24 });

  expect(result.changes.map((change) => change.type)).toEqual([
    'paneRemoved',
    'tabLayoutChanged',
    'paneFocused',
    'paneResized',
  ]);
});

it('focuses the first pane of a sibling split when its neighbor closes', () => {
  const state = run([
    createKoja,
    attachLarge,
    splitFirst('right'),
    { type: 'splitPane', paneId: paneId(2), direction: 'below', folder: undefined },
    { type: 'focusPane', paneId: paneId(1) },
  ]);

  const result = intent(state, { type: 'closePane', paneId: paneId(1) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 79, rows: 10 },
    { columns: 79, rows: 10 },
  ]);
});

it('keeps the focus when an unfocused pane closes', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);
  const result = intent(state, { type: 'closePane', paneId: paneId(1) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));
  expect(result.changes.some((change) => change.type === 'paneFocused')).toBe(false);
});

it('removes the tab and workspace when the last pane of a tab closes', () => {
  const result = intent(run([createKoja]), { type: 'closePane', paneId: paneId(1) });

  expect(result.state.tabs).toEqual([]);
  expect(result.state.workspaces).toEqual([]);
  expect(result.state.panes).toEqual([]);
});

it('focuses another pane of the tab', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);
  const result = intent(state, { type: 'focusPane', paneId: paneId(1) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.changes).toEqual([{ type: 'paneFocused', tabId: tabId(1), paneId: paneId(1) }]);
});

it('makes the tab of the focused pane active when that tab is inactive', () => {
  const state = run([createKoja, attachLarge, splitFirst('right'), createTab]);
  const result = intent(state, { type: 'focusPane', paneId: paneId(1) });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(focusedPane(result.state)?.id).toBe(paneId(1));

  expect(result.changes).toEqual([
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(1) },
    { type: 'tabFocused', workspaceId: workspaceId(1), tabId: tabId(1) },
    { type: 'clientViewChanged', clientId: clientId(1), view: result.state.defaultView },
  ]);
});

it('focuses the workspace of the focused pane when that workspace is unfocused', () => {
  const state = run([createKoja, createDocs]);
  const result = intent(state, { type: 'focusPane', paneId: paneId(1) });

  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(focusedPane(result.state)?.id).toBe(paneId(1));
  expect(result.changes).toEqual([{ type: 'workspaceFocused', workspaceId: workspaceId(1) }]);
});

it('focuses the tab and workspace of a pane in an inactive tab of an unfocused workspace', () => {
  const state = run([createKoja, attachLarge, splitFirst('right'), createTab, createDocs]);

  const result = intent(state, { type: 'focusPane', paneId: paneId(1) });

  expect(activeTabOf(result.state.defaultView, workspaceId(1))).toBe(tabId(1));
  expect(result.state.defaultView.focusedWorkspaceId).toBe(workspaceId(1));
  expect(focusedPane(result.state)?.id).toBe(paneId(1));

  expect(result.changes).toEqual([
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(1) },
    { type: 'tabFocused', workspaceId: workspaceId(1), tabId: tabId(1) },
    { type: 'workspaceFocused', workspaceId: workspaceId(1) },
    { type: 'clientViewChanged', clientId: clientId(1), view: result.state.defaultView },
  ]);
});

it('closes only the pane that exits in a tab with two panes', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);

  const started = fact(state, startedPane(2, 2)).state;

  const result = fact(started, {
    type: 'paneExited',
    paneId: paneId(2),
    generation: 2,
    exitCode: 0,
  });

  expect(result.state.workspaces).toHaveLength(1);
  expect(result.state.tabs).toHaveLength(1);
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.state.tabs[0]?.layout).toEqual({ kind: 'pane', paneId: paneId(1) });
});

it.each([
  [
    'split an unknown pane',
    { type: 'splitPane', paneId: paneId(9), direction: 'right', folder: undefined },
    'unknownPane',
  ],
  ['focus an unknown pane', { type: 'focusPane', paneId: paneId(9) }, 'unknownPane'],
  ['close an unknown pane', { type: 'closePane', paneId: paneId(9) }, 'unknownPane'],
  ['split a pane too narrow for two frames', splitFirst('right'), 'paneTooSmall'],
  ['split a pane too short for two frames', splitFirst('below'), 'paneTooSmall'],
] as const)('refuses to %s and leaves state unchanged', (_name, refused, reason) => {
  const state = run([createKoja, tinyClient]);

  expect(applyIntent(state, refused)).toEqual({ kind: 'rejected', state, reason });
});

it('splits a pane that has room for exactly two framed 1x1 terminals and a gap', () => {
  const state = run([createKoja, { type: 'attachClient', size: { columns: 7, rows: 7 } }]);
  const result = intent(state, splitFirst('right'));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 1, rows: 4 },
    { columns: 1, rows: 4 },
  ]);

  expect(
    applyIntent(result.state, {
      type: 'splitPane',
      paneId: paneId(2),
      direction: 'right',
      folder: undefined,
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'paneTooSmall' });
});

it('splits a pane by rows with no gap and refuses one row fewer', () => {
  const fits = run([createKoja, { type: 'attachClient', size: { columns: 3, rows: 7 } }]);
  const result = intent(fits, splitFirst('below'));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 1, rows: 1 },
    { columns: 1, rows: 1 },
  ]);

  const short = run([createKoja, { type: 'attachClient', size: { columns: 3, rows: 6 } }]);

  expect(applyIntent(short, splitFirst('below'))).toMatchObject({
    kind: 'rejected',
    reason: 'paneTooSmall',
  });
});

it('refuses a right split one column short of two frames and a gap', () => {
  const short = run([createKoja, { type: 'attachClient', size: { columns: 6, rows: 4 } }]);

  expect(applyIntent(short, splitFirst('right'))).toMatchObject({
    kind: 'rejected',
    reason: 'paneTooSmall',
  });
});

it.each([
  ['split', { type: 'splitPane', paneId: paneId(1), direction: 'right', folder: undefined }],
  ['focus', { type: 'focusPane', paneId: paneId(1) }],
  ['close', { type: 'closePane', paneId: paneId(1) }],
] as const)('refuses to %s a pane while the server stops', (_name, refused) => {
  const state = run([createKoja, { type: 'stopServer' }]);

  expect(applyIntent(state, refused)).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

it('gives the area of a closed pane to its sibling without an attached client', () => {
  const state = run([createKoja, splitFirst('right')]);
  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(result.state.panes[0]?.size).toEqual({ columns: 80, rows: 24 });

  expect(result.changes).toContainEqual({
    type: 'paneResized',
    paneId: paneId(1),
    size: { columns: 80, rows: 24 },
  });
});

it('gives the area of an exited pane to its sibling without an attached client', () => {
  const state = run([createKoja, splitFirst('right')]);
  const result = fact(state, { type: 'paneExited', paneId: paneId(2), generation: 2, exitCode: 0 });

  expect(result.state.panes[0]?.size).toEqual({ columns: 80, rows: 24 });

  expect(result.changes).toContainEqual({
    type: 'paneResized',
    paneId: paneId(1),
    size: { columns: 80, rows: 24 },
  });
});

it('splits by the area of the last client after it detaches', () => {
  const state = run([
    createKoja,
    { type: 'attachClient', size: { columns: 2, rows: 26 } },
    { type: 'detachClient', clientId: clientId(1) },
  ]);

  expect(applyIntent(state, splitFirst('right'))).toEqual({
    kind: 'rejected',
    state,
    reason: 'paneTooSmall',
  });
});

it('keeps the focus on an unfocused pane when its neighbor closes, and gives it the area', () => {
  const state = run([
    createKoja,
    attachLarge,
    splitFirst('right'),
    { type: 'splitPane', paneId: paneId(2), direction: 'below', folder: undefined },
    { type: 'focusPane', paneId: paneId(1) },
  ]);

  const result = intent(state, { type: 'closePane', paneId: paneId(3) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));

  expect(result.state.panes.map((pane) => pane.size)).toEqual([
    { columns: 38, rows: 22 },
    { columns: 38, rows: 22 },
  ]);
});

it('returns the focus to the earlier pane when a split pane fails to start', () => {
  const opened = run([createKoja, attachLarge, splitFirst('right')]);
  const state = fact(opened, startedPane(2, 2)).state;
  const split = intent(state, splitFirst('below'));

  expect(split.state.tabs[0]?.focusedPaneId).toBe(paneId(3));

  const result = fact(split.state, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);

  expect(result.changes).toContainEqual({
    type: 'paneFocused',
    tabId: tabId(1),
    paneId: paneId(2),
  });
});

it('gives the focus to the sibling when the focused pane of a split fails to start', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);

  const result = fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: 2,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
});

it('zooms a pane over the whole area and keeps the size of the hidden pane', () => {
  const split = run([createKoja, attachLarge, splitFirst('right')]);
  const result = intent(split, zoom(1));

  expect(result.state.tabs[0]?.zoomedPaneId).toBe(paneId(1));
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.state.panes[0]?.size).toEqual({ columns: 81, rows: 24 });
  expect(result.state.panes[1]?.size).toEqual({ columns: 38, rows: 22 });

  expect(result.changes).toEqual([
    { type: 'tabZoomChanged', tabId: tabId(1), zoomedPaneId: paneId(1) },
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(1) },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 81, rows: 24 } },
  ]);

  const unzoomed = intent(result.state, zoom(1));

  expect(unzoomed.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(sizes(unzoomed.state)).toEqual(sizes(split));

  expect(unzoomed.changes).toEqual([
    { type: 'tabZoomChanged', tabId: tabId(1), zoomedPaneId: undefined },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 38, rows: 22 } },
  ]);
});

it('zooms and focuses a pane that is not focused', () => {
  const split = run([createKoja, attachLarge, splitFirst('right')]);
  const result = intent(split, zoom(1));

  expect(split.tabs[0]?.focusedPaneId).toBe(paneId(2));
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
});

it('does not zoom a tab with one pane', () => {
  const state = run([createKoja, attachLarge]);
  const result = intent(state, zoom(1));

  expect(result.changes).toEqual([]);
  expect(result.state.tabs).toEqual(state.tabs);
});

it('keeps the size of a hidden pane while the client resizes, and refits it on unzoom', () => {
  const zoomed = run([createKoja, attachLarge, splitFirst('right'), zoom(1)]);
  const client = zoomed.attachedClientId;

  if (client === undefined) {
    throw new Error('No client.');
  }

  const resized = intent(zoomed, {
    type: 'resizeClient',
    clientId: client,
    size: { columns: 61, rows: 25 },
  });

  expect(resized.state.panes[0]?.size).toEqual({ columns: 41, rows: 24 });
  expect(resized.state.panes[1]?.size).toEqual({ columns: 38, rows: 22 });
  expect(intent(resized.state, zoom(1)).state.panes[1]?.size).toEqual({ columns: 18, rows: 22 });
});

it('unzooms when the zoomed pane is split', () => {
  const state = run([createKoja, attachLarge, splitFirst('right'), zoom(1)]);
  const result = intent(state, splitPaneOf(1, 'below'));

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(3));
  expect(result.state.panes.every((pane) => pane.size.columns <= 38)).toBe(true);

  expect(result.changes).toContainEqual({
    type: 'tabZoomChanged',
    tabId: tabId(1),
    zoomedPaneId: undefined,
  });
});

it('restores the zoom and focus when a split pane of a zoomed tab fails to start', () => {
  const zoomed = run([createKoja, attachLarge, splitFirst('right'), zoom(1)]);
  const split = intent(zoomed, splitPaneOf(1, 'below'));

  const result = fact(split.state, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.zoomedPaneId).toBe(paneId(1));
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1), paneId(2)]);
  expect(result.state.panes[0]?.size).toEqual({ columns: 81, rows: 24 });

  expect(result.changes).toContainEqual({
    type: 'tabZoomChanged',
    tabId: tabId(1),
    zoomedPaneId: paneId(1),
  });
});

it('does not report a zoom change when a failed split leaves the zoom as it was', () => {
  const split = run([createKoja, attachLarge, splitFirst('right')]);

  const result = fact(split, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: 2,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(result.changes.some((change) => change.type === 'tabZoomChanged')).toBe(false);
});

it('unzooms when a started split pane closes', () => {
  const opened = run([createKoja, attachLarge, splitFirst('right')]);
  const started = fact(opened, startedPane(2, 2)).state;
  const zoomed = intent(started, zoom(1)).state;
  const split = intent(zoomed, splitPaneOf(1, 'below')).state;
  const running = fact(split, startedPane(3, 3)).state;
  const result = intent(running, { type: 'closePane', paneId: paneId(3) });

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
});

it('leaves the tab unzoomed when the focus moved before a split pane failed to start', () => {
  const zoomed = run([createKoja, attachLarge, splitFirst('right'), zoom(1)]);
  const split = intent(zoomed, splitPaneOf(1, 'below')).state;
  const refocused = intent(split, { type: 'focusPane', paneId: paneId(2) }).state;

  const result = fact(refocused, {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(2));
});

it('unzooms when a pane closes', () => {
  const state = run([createKoja, attachLarge, splitFirst('right'), zoom(1)]);
  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(result.state.panes.map((pane) => pane.size)).toEqual([{ columns: 81, rows: 24 }]);

  expect(result.changes).toContainEqual({
    type: 'tabZoomChanged',
    tabId: tabId(1),
    zoomedPaneId: undefined,
  });
});

it('unzooms when another pane takes the focus, but not when the zoomed pane does', () => {
  const state = run([createKoja, attachLarge, splitFirst('right'), zoom(1)]);
  const same = intent(state, { type: 'focusPane', paneId: paneId(1) });
  const other = intent(state, { type: 'focusPane', paneId: paneId(2) });

  expect(same.state.tabs[0]?.zoomedPaneId).toBe(paneId(1));
  expect(same.changes).toEqual([]);
  expect(other.state.tabs[0]?.zoomedPaneId).toBeUndefined();
  expect(other.state.tabs[0]?.focusedPaneId).toBe(paneId(2));
  expect(sizes(other.state)).toEqual(sizes(run([createKoja, attachLarge, splitFirst('right')])));

  expect(other.changes).toEqual([
    { type: 'paneFocused', tabId: tabId(1), paneId: paneId(2) },
    { type: 'tabZoomChanged', tabId: tabId(1), zoomedPaneId: undefined },
    { type: 'paneResized', paneId: paneId(1), size: { columns: 38, rows: 22 } },
  ]);
});

it('resizes the panes of a nested layout by whole cells in each direction', () => {
  const state = nestedState();

  expect(sizes(state)).toEqual(
    new Map([
      [paneId(1), '38x10'],
      [paneId(2), '38x22'],
      [paneId(3), '38x10'],
    ]),
  );

  const right = intent(state, resize(1, 'right', 3)).state;
  const left = intent(state, resize(2, 'left', 2)).state;
  const down = intent(state, resize(1, 'down', 2)).state;
  const up = intent(state, resize(3, 'up', 1)).state;

  expect(sizes(right).get(paneId(1))).toBe('41x10');
  expect(sizes(right).get(paneId(2))).toBe('35x22');
  expect(sizes(left).get(paneId(1))).toBe('36x10');
  expect(sizes(left).get(paneId(2))).toBe('40x22');
  expect(sizes(down).get(paneId(1))).toBe('38x12');
  expect(sizes(down).get(paneId(3))).toBe('38x8');
  expect(sizes(up).get(paneId(1))).toBe('38x9');
  expect(sizes(up).get(paneId(3))).toBe('38x11');
});

it('reports the new layout and the resized panes of a resize', () => {
  const result = intent(nestedState(), resize(1, 'right', 1));

  expect(result.changes.map((change) => change.type)).toEqual([
    'tabLayoutChanged',
    'paneResized',
    'paneResized',
    'paneResized',
  ]);
});

it('unzooms a zoomed tab before it resizes', () => {
  const state = run([createKoja, attachLarge, splitFirst('right'), zoom(1)]);
  const result = intent(state, resize(1, 'right', 2));

  expect(result.state.tabs[0]?.zoomedPaneId).toBeUndefined();

  expect(sizes(result.state)).toEqual(
    new Map([
      [paneId(1), '40x22'],
      [paneId(2), '36x22'],
    ]),
  );
});

it('clamps a resize at a framed 1x1 terminal and applies no changes when nothing moves', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);
  const shrunk = intent(state, resize(1, 'left', 500));

  expect(sizes(shrunk.state).get(paneId(1))).toBe('1x22');
  expect(sizes(shrunk.state).get(paneId(2))).toBe('75x22');

  const stuck = intent(shrunk.state, resize(1, 'left', 1));

  expect(stuck.changes).toEqual([]);
  expect(stuck.state.tabs).toEqual(shrunk.state.tabs);
  expect(sizes(intent(state, resize(1, 'right', 500)).state).get(paneId(2))).toBe('1x22');
});

it('applies no changes when a nested resize is stopped at the minimum', () => {
  const shrunk = intent(nestedState(), resize(1, 'up', 500));
  const stuck = intent(shrunk.state, resize(1, 'up', 1));

  expect(stuck.changes).toEqual([]);
  expect(stuck.state.tabs).toEqual(shrunk.state.tabs);
  expect(stuck.state.revision).toBe(shrunk.state.revision);
});

it('rejects a resize with no split on that axis and changes nothing', () => {
  const lone = run([createKoja, attachLarge]);
  const sideBySide = run([createKoja, attachLarge, splitFirst('right'), zoom(1)]);

  expect(applyIntent(lone, resize(1, 'left', 1))).toEqual({
    kind: 'rejected',
    state: lone,
    reason: 'noSplit',
  });

  expect(applyIntent(sideBySide, resize(1, 'up', 1))).toEqual({
    kind: 'rejected',
    state: sideBySide,
    reason: 'noSplit',
  });
});

it.each([
  ['zoom', zoom(9)],
  ['resize', resize(9, 'left', 1)],
] as const)('rejects a %s of an unknown pane', (_name, refused) => {
  const state = run([createKoja]);

  expect(applyIntent(state, refused)).toEqual({ kind: 'rejected', state, reason: 'unknownPane' });
});

it.each([
  ['zoom', zoom(1)],
  ['resize', resize(1, 'left', 1)],
] as const)('refuses to %s a pane while the server stops', (_name, refused) => {
  const state = run([createKoja, splitFirst('right'), { type: 'stopServer' }]);

  expect(applyIntent(state, refused)).toEqual({
    kind: 'rejected',
    state,
    reason: 'serverStopping',
  });
});

it('closes a new pane that fails to start through the usual cascade', () => {
  const state = run([createKoja, createDocs]);
  const second = state.panes[1];

  const result = fact(state, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: second?.generation ?? 0,
    message: 'Cannot start /bin/missing',
  });

  expect(result.state.workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(1)]);
  expect(result.state.panes.map((pane) => pane.id)).toEqual([paneId(1)]);
  expect(result.changes.map((change) => change.type)).toContain('workspaceRemoved');
});

it('records the folder of a splitPane intent on the new pane', () => {
  const state = run([createKoja, attachLarge]);

  const result = intent(state, {
    type: 'splitPane',
    paneId: paneId(1),
    direction: 'right',
    folder: '/srv/source',
  });

  expect(result.state.panes.find((pane) => pane.id === paneId(2))?.startFolder).toBe('/srv/source');
  expect(result.state.panes.find((pane) => pane.id === paneId(1))?.startFolder).toBeUndefined();
});

it('refuses to split a pane that is too small while the first pane has room', () => {
  const state = run([
    createKoja,
    attachLarge,
    splitFirst('below'),
    splitPaneOf(2, 'below'),
    splitPaneOf(3, 'below'),
  ]);

  expect(applyIntent(state, splitPaneOf(4, 'below'))).toEqual({
    kind: 'rejected',
    state,
    reason: 'paneTooSmall',
  });
});

it('gives the new pane of a split the size of its own area', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);
  const result = intent(state, splitPaneOf(2, 'below'));

  const added = result.changes.flatMap((change) =>
    change.type === 'paneAdded' ? [change.pane] : [],
  );

  expect(added.map((pane) => pane.size)).toEqual([{ columns: 38, rows: 10 }]);
});

it('focuses the sibling when the pane recorded before a split has closed', () => {
  const state = run([
    createKoja,
    attachLarge,
    splitFirst('right'),
    splitPaneOf(2, 'below'),
    { type: 'closePane', paneId: paneId(1) },
    { type: 'focusPane', paneId: paneId(2) },
  ]);

  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(3));

  expect(result.changes).toContainEqual({
    type: 'paneFocused',
    tabId: tabId(1),
    paneId: paneId(3),
  });
});

it('drops the record of a split when its pane closes', () => {
  const state = run([createKoja, attachLarge, splitFirst('right')]);
  const result = intent(state, { type: 'closePane', paneId: paneId(2) });

  expect(state.stateBeforeSplit.has(paneId(2))).toBe(true);
  expect(result.state.stateBeforeSplit.has(paneId(2))).toBe(false);
});

it('changes only its own tab when a pane closes', () => {
  const state = run([createKoja, attachLarge, createTab, splitFirst('right')]);
  const result = intent(state, { type: 'closePane', paneId: paneId(3) });

  expect(result.state.tabs[1]).toEqual(state.tabs[1]);
  expect(result.state.tabs[0]?.layout).toEqual({ kind: 'pane', paneId: paneId(1) });
});

it('changes only its own tab when a pane resizes', () => {
  const state = run([createKoja, attachLarge, createTab, splitFirst('right')]);
  const result = intent(state, resize(1, 'right', 2));

  expect(result.state.tabs[1]).toEqual(state.tabs[1]);
  expect(result.state.tabs[0]?.layout).not.toEqual(state.tabs[0]?.layout);
});

it('keeps a closing pane in state as exited when the server stops', () => {
  const stopped = run([createKoja, attachLarge, splitFirst('right'), { type: 'stopServer' }]);

  const result = fact(stopped, {
    type: 'paneExited',
    paneId: paneId(2),
    generation: 2,
    exitCode: 4,
  });

  expect(result.state.stopping).toBe(true);
  expect(result.state.tabs).toEqual(stopped.tabs);
  expect(result.state.panes[0]).toEqual(stopped.panes[0]);

  expect(result.state.panes[1]).toEqual({
    ...defined(stopped.panes[1]),
    lifecycle: 'exited',
    exitCode: 4,
  });
});

const fallbackPaneIds = (state: State): PaneId[] =>
  state.startFallbacks.map((fallback) => fallback.paneId);

it('keeps the start fallback of another pane when a pane starts', () => {
  const state = run([createKoja, createDocs]);
  const result = fact(state, startedPane(2, 2));

  expect(fallbackPaneIds(state)).toEqual([paneId(1), paneId(2)]);
  expect(fallbackPaneIds(result.state)).toEqual([paneId(1)]);
});

it.each([
  ['exits', { type: 'paneExited', paneId: paneId(2), generation: 2, exitCode: 0 }],
  [
    'fails to start',
    { type: 'paneFailedToStart', paneId: paneId(2), generation: 2, message: 'no shell' },
  ],
] as const)('keeps the start fallback of another pane when a pane %s', (_name, ending) => {
  const state = run([createKoja, createDocs]);
  const result = fact(state, ending);

  expect(fallbackPaneIds(result.state)).toEqual([paneId(1)]);
});

it('marks a restored pane running when it starts, not failed', () => {
  const saved = savedSessionOf(run([createKoja]), noFolders);
  const restored = intent(createState(), { type: 'restoreSession', session: saved }).state;
  const result = fact(restored, startedPane(1, restored.panes[0]?.generation ?? 0));

  expect(result.state.panes[0]?.lifecycle).toBe('running');
  expect(result.state.panes[0]?.error).toBeUndefined();
});

it('focuses the sibling when the pane recorded before a split moved to another tab', () => {
  const state = run([
    createKoja,
    attachLarge,
    splitFirst('right'),
    splitPaneOf(2, 'below'),
    { type: 'movePane', paneId: paneId(2), destination: { kind: 'newTab' } },
  ]);

  const result = intent(state, { type: 'closePane', paneId: paneId(3) });

  expect(result.state.tabs[0]?.focusedPaneId).toBe(paneId(1));
});

it('marks a running pane failed with the message of a pane that failed while it ran', () => {
  const started = fact(run([createKoja]), startedPane(1, 1)).state;

  const result = fact(started, {
    type: 'paneFailed',
    ...firstPane,
    message: 'Pane output failed: boom',
  });

  expect(result.state.panes[0]).toMatchObject({
    lifecycle: 'failed',
    error: 'Pane output failed: boom',
    restored: false,
  });

  expect(result.changes).toEqual([
    {
      type: 'paneStateChanged',
      paneId: paneId(1),
      lifecycle: 'failed',
      exitCode: undefined,
      error: 'Pane output failed: boom',
    },
  ]);
});

it('ends a pane that failed while it ran when the server stops', () => {
  const started = fact(run([createKoja]), startedPane(1, 1)).state;
  const stopping = intent(started, { type: 'stopServer' }).state;

  const result = fact(stopping, {
    type: 'paneFailed',
    ...firstPane,
    message: 'Pane output failed: boom',
  });

  expect(result.state.panes[0]?.lifecycle).toBe('exited');
});

const orderOf = (state: State): PaneId[] => [...defined(state.tabs[0]).arrangement.order];

it('puts a split pane in the order after the pane it split', () => {
  const state = nestedState();

  expect(state.tabs[0]?.arrangement).toEqual({
    choice: 'legacy',
    order: [paneId(1), paneId(3), paneId(2)],
  });
});

it('keeps a master choice and its order when a pane splits', () => {
  const opened = run([createKoja, attachLarge, splitFirst('right')]);
  const tab = defined(opened.tabs[0]);

  const master: State = {
    ...opened,
    tabs: [{ ...tab, arrangement: { choice: 'master', order: [paneId(2), paneId(1)] } }],
  };

  const result = intent(master, splitFirst('below'));

  const arrangement: Arrangement = {
    choice: 'master',
    order: [paneId(2), paneId(1), paneId(3)],
  };

  expect(result.state.tabs[0]?.arrangement).toEqual(arrangement);

  expect(result.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(1),
    layout: defined(result.state.tabs[0]).layout,
    arrangement,
  });
});

it('drops a closed pane from the order', () => {
  const result = intent(nestedState(), { type: 'closePane', paneId: paneId(3) });

  expect(orderOf(result.state)).toEqual([paneId(1), paneId(2)]);

  expect(result.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(1),
    layout: defined(result.state.tabs[0]).layout,
    arrangement: { choice: 'legacy', order: [paneId(1), paneId(2)] },
  });
});

it('drops a pane that fails to start from the order', () => {
  const result = fact(nestedState(), {
    type: 'paneFailedToStart',
    paneId: paneId(3),
    generation: 3,
    message: 'no shell',
  });

  expect(orderOf(result.state)).toEqual([paneId(1), paneId(2)]);
});

it('keeps the order when a pane resizes', () => {
  const state = nestedState();
  const result = intent(state, resize(2, 'left', 2));

  expect(result.changes).toContainEqual({
    type: 'tabLayoutChanged',
    tabId: tabId(1),
    layout: defined(result.state.tabs[0]).layout,
    arrangement: defined(state.tabs[0]).arrangement,
  });

  expect(result.state.tabs[0]?.arrangement).toEqual(state.tabs[0]?.arrangement);
});
