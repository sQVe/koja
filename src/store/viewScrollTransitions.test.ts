import { expect, it } from 'bun:test';

import { clientId, paneId } from '../ids.ts';
import { applyIntent } from './store.ts';
import type { State } from './store.ts';
import { createDocs, createPhi, intent, twoClients } from './storeFixtures.ts';
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
