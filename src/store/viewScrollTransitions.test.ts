import { expect, it } from 'bun:test';

import { clientId, paneId } from '../ids.ts';
import { applyFact, applyIntent } from './store.ts';
import type { State } from './store.ts';
import { createDocs, createPhi, fact, intent, twoClients } from './storeFixtures.ts';
import { scrollOf } from './view.ts';

const scroll = (state: State, client: number, pane: number, row: number | undefined) =>
  intent(state, { type: 'scrollPane', clientId: clientId(client), paneId: paneId(pane), row });

const scrollOfClient = (state: State, client: number, pane: number): number | undefined => {
  const view = state.clients.find((known) => known.id === clientId(client))?.view;

  return view === undefined ? undefined : scrollOf(view, paneId(pane));
};

it('scrolls the view of the target client only and reports it', () => {
  const state = twoClients(createPhi, createDocs);
  const result = scroll(state, 1, 1, 7);

  expect(scrollOfClient(result.state, 1, 1)).toBe(7);
  expect(scrollOfClient(result.state, 2, 1)).toBeUndefined();
  expect(scrollOf(result.state.defaultView, paneId(1))).toBeUndefined();

  expect(result.changes).toEqual([
    {
      type: 'clientViewChanged',
      clientId: clientId(1),
      view: { ...state.defaultView, scrolls: [{ paneId: paneId(1), topRow: 7 }] },
    },
  ]);
});

it('keeps a position for each pane', () => {
  const state = twoClients(createPhi, createDocs);
  const first = scroll(state, 1, 1, 7);
  const second = scroll(first.state, 1, 2, 3);

  expect(scrollOfClient(second.state, 1, 1)).toBe(7);
  expect(scrollOfClient(second.state, 1, 2)).toBe(3);
});

it('clears the position when the view follows the bottom again', () => {
  const state = twoClients(createPhi, createDocs);
  const scrolled = scroll(state, 1, 1, 7).state;
  const result = scroll(scrolled, 1, 1, undefined);

  expect(scrollOfClient(result.state, 1, 1)).toBeUndefined();

  expect(result.changes).toEqual([
    { type: 'clientViewChanged', clientId: clientId(1), view: state.defaultView },
  ]);
});

it('reports nothing when the position does not change', () => {
  const state = twoClients(createPhi, createDocs);
  const scrolled = scroll(state, 1, 1, 7).state;

  expect(scroll(scrolled, 1, 1, 7).changes).toEqual([]);
  expect(scroll(state, 1, 1, undefined).changes).toEqual([]);
});

it('refuses an unknown client and an unknown pane without changing the state', () => {
  const state = twoClients(createPhi, createDocs);

  const unknownClient = applyIntent(state, {
    type: 'scrollPane',
    clientId: clientId(9),
    paneId: paneId(1),
    row: 7,
  });

  const unknownPane = applyIntent(state, {
    type: 'scrollPane',
    clientId: clientId(1),
    paneId: paneId(9),
    row: 7,
  });

  expect(unknownClient).toMatchObject({ kind: 'rejected', reason: 'unknownClient' });
  expect(unknownPane).toMatchObject({ kind: 'rejected', reason: 'unknownPane' });
  expect(unknownClient.state).toBe(state);
  expect(unknownPane.state).toBe(state);
});

const renumbered = (
  state: State,
  fields: { oldActiveTop: number; first: number; newActiveTop: number },
) => fact(state, { type: 'paneRowsRenumbered', paneId: paneId(1), generation: 1, ...fields });

it('keeps the distance from the bottom when the rows are renumbered', () => {
  const state = twoClients(createPhi, createDocs);
  const scrolled = scroll(scroll(state, 1, 1, 70).state, 1, 2, 5).state;

  const result = renumbered(scrolled, { oldActiveTop: 100, first: 1000, newActiveTop: 1200 });

  expect(scrollOfClient(result.state, 1, 1)).toBe(1170);
  expect(scrollOfClient(result.state, 1, 2)).toBe(5);
  expect(scrollOfClient(result.state, 2, 1)).toBeUndefined();

  expect(result.changes).toEqual([
    {
      type: 'clientViewChanged',
      clientId: clientId(1),
      view: {
        ...state.defaultView,
        scrolls: [
          { paneId: paneId(1), topRow: 1170 },
          { paneId: paneId(2), topRow: 5 },
        ],
      },
    },
  ]);
});

it('stops at the oldest row when the distance is longer than the history', () => {
  const state = scroll(twoClients(createPhi, createDocs), 1, 1, 10).state;
  const result = renumbered(state, { oldActiveTop: 100, first: 1150, newActiveTop: 1200 });

  expect(scrollOfClient(result.state, 1, 1)).toBe(1150);
});

it('follows the bottom when the row reaches the active top', () => {
  const state = scroll(twoClients(createPhi, createDocs), 1, 1, 100).state;
  const result = renumbered(state, { oldActiveTop: 100, first: 1000, newActiveTop: 1200 });

  expect(scrollOfClient(result.state, 1, 1)).toBeUndefined();

  expect(result.changes).toEqual([
    { type: 'clientViewChanged', clientId: clientId(1), view: state.defaultView },
  ]);
});

it('ignores renumbering from an old pane generation', () => {
  const state = scroll(twoClients(createPhi, createDocs), 1, 1, 70).state;

  const result = applyFact(state, {
    type: 'paneRowsRenumbered',
    paneId: paneId(1),
    generation: 2,
    oldActiveTop: 100,
    first: 1000,
    newActiveTop: 1200,
  });

  expect(result.kind).toBe('ignored');
  expect(result.state).toBe(state);
});

it('reports nothing when no view scrolls the pane', () => {
  const state = twoClients(createPhi, createDocs);
  const result = renumbered(state, { oldActiveTop: 100, first: 1000, newActiveTop: 1200 });

  expect(result).toMatchObject({ kind: 'applied', changes: [] });
});

it('follows the bottom when a reset removes the history', () => {
  const state = scroll(twoClients(createPhi, createDocs), 1, 1, 70).state;
  const result = renumbered(state, { oldActiveTop: 100, first: 1000, newActiveTop: 1000 });

  expect(scrollOfClient(result.state, 1, 1)).toBeUndefined();
});

it('drops the position of a closed pane with the next scroll', () => {
  const state = twoClients(createPhi, createDocs);
  const scrolled = scroll(state, 1, 1, 7).state;
  const closed = intent(scrolled, { type: 'closePane', paneId: paneId(1) }).state;
  const result = scroll(closed, 1, 2, 3);

  expect(result.state.clients[0]?.view.scrolls).toEqual([{ paneId: paneId(2), topRow: 3 }]);
});
