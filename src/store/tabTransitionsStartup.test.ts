import { expect, it } from 'bun:test';

import { clientId, paneId, workspaceId } from '../ids.ts';
import { createState, savedSessionOf } from './store.ts';
import type { Intent } from './store.ts';
import {
  createApi,
  createDocs,
  createKoja,
  createTab,
  defined,
  fact,
  intent,
  noReads,
  twoClients,
} from './storeFixtures.ts';

it('restores an existing empty workspace when its first tab fails to start', () => {
  const empty = intent(twoClients(createKoja), { type: 'closePane', paneId: paneId(1) }).state;
  const created = intent(empty, createTab).state;
  const pane = defined(created.panes[0]);

  const result = fact(created, {
    type: 'paneFailedToStart',
    paneId: pane.id,
    generation: pane.generation,
    message: 'Unavailable working directory',
  });

  expect(result.state.workspaces).toEqual(empty.workspaces);

  expect(result.state.workspaces[0]).toEqual({
    id: workspaceId(1),
    root: '/work/koja',
    label: 'koja',
    tabIds: [],
  });

  expect(result.state.tabs).toEqual([]);
  expect(result.state.panes).toEqual([]);
  expect(result.state.defaultView).toEqual(empty.defaultView);
  expect(result.state.clients).toEqual(empty.clients);
  expect(result.state.startFallbacks).toEqual([]);
  expect(result.changes.some((change) => change.type === 'workspaceRemoved')).toBe(false);
});

it('restores an empty saved workspace after its first tab fails to start', () => {
  const empty = intent(twoClients(createKoja), { type: 'closePane', paneId: paneId(1) }).state;

  const restored = intent(createState(), {
    type: 'restoreSession',
    session: savedSessionOf(empty, noReads),
  }).state;

  const created = intent(restored, createTab).state;
  const pane = defined(created.panes[0]);

  const result = fact(created, {
    type: 'paneFailedToStart',
    paneId: pane.id,
    generation: pane.generation,
    message: 'Unavailable working directory',
  });

  expect(savedSessionOf(result.state, noReads).workspaces).toEqual(
    savedSessionOf(empty, noReads).workspaces,
  );

  expect(result.state.tabs).toEqual([]);
  expect(result.state.panes).toEqual([]);
  expect(result.state.defaultView).toEqual(restored.defaultView);
});

it('keeps a newer workspace selection when the first tab fails', () => {
  const empty = intent(twoClients(createKoja, createDocs, createApi), {
    type: 'closePane',
    paneId: paneId(1),
  }).state;

  const created = intent(empty, { ...createTab, clientId: clientId(1) }).state;

  const focus: Intent = {
    type: 'focusWorkspace',
    workspaceId: workspaceId(2),
    clientId: clientId(1),
  };

  const moved = intent(created, focus).state;
  const expected = intent(empty, focus).state;
  const pane = defined(created.panes.find((known) => known.id === paneId(4)));

  const result = fact(moved, {
    type: 'paneFailedToStart',
    paneId: pane.id,
    generation: pane.generation,
    message: 'Unavailable working directory',
  });

  expect(result.state.workspaces).toEqual(empty.workspaces);
  expect(result.state.defaultView).toEqual(expected.defaultView);
  expect(result.state.clients).toEqual(expected.clients);
});

it.each([
  { name: 'focused', focus: true },
  { name: 'unfocused', focus: false },
])('repairs every view after a $name first tab fails', ({ focus }) => {
  const empty = intent(twoClients(createKoja, createDocs), {
    type: 'closePane',
    paneId: paneId(1),
  }).state;

  const created = intent(empty, { ...createTab, clientId: clientId(1), focus }).state;
  const pane = defined(created.panes.find((known) => known.id === paneId(3)));

  const result = fact(created, {
    type: 'paneFailedToStart',
    paneId: pane.id,
    generation: pane.generation,
    message: 'Unavailable working directory',
  });

  expect(result.state.workspaces).toEqual(empty.workspaces);
  expect(result.state.tabs).toEqual(empty.tabs);
  expect(result.state.panes).toEqual(empty.panes);
  expect(result.state.defaultView).toEqual(empty.defaultView);
  expect(result.state.clients).toEqual(empty.clients);
  expect(result.state.startFallbacks).toEqual(empty.startFallbacks);
});
