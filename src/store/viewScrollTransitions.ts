import type { ClientId, PaneId } from '../ids.ts';
import type { Fact, State } from './store.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome, Proposal } from './transitionOutcome.ts';
import { clientViewChanges } from './view.ts';

type Renumbered = Extract<Fact, { type: 'paneRowsRenumbered' }>;

// Scrolls one client's view of a pane to the stable row at its top, or back to the bottom when
// the row is absent. A closed pane's position goes with the next scroll.
export const scrollPaneView = (
  state: State,
  id: ClientId,
  target: PaneId,
  row: number | undefined,
): Outcome => {
  if (!state.panes.some((pane) => pane.id === target)) {
    return refuse('unknownPane');
  }

  const clients = state.clients.map((client) => {
    if (client.id !== id) {
      return client;
    }

    const kept = client.view.scrolls.filter(
      (scroll) => scroll.paneId !== target && state.panes.some((pane) => pane.id === scroll.paneId),
    );

    const scrolls = row === undefined ? kept : [...kept, { paneId: target, topRow: row }];

    return { ...client, view: { ...client.view, scrolls } };
  });

  return propose({ ...state, clients }, clientViewChanges(state.clients, clients));
};

// Keeps each view's distance from the bottom of a pane across a restart of its row numbers.
export const renumberPaneScrolls = (state: State, fact: Renumbered): Proposal => {
  const clients = state.clients.map((client) => {
    const scrolls = client.view.scrolls.flatMap((scroll) => {
      if (scroll.paneId !== fact.paneId) {
        return [scroll];
      }

      const kept = fact.newActiveTop - (fact.oldActiveTop - scroll.topRow);
      const top = Math.max(kept, fact.first);

      return top >= fact.newActiveTop ? [] : [{ paneId: scroll.paneId, topRow: top }];
    });

    return { ...client, view: { ...client.view, scrolls } };
  });

  return propose({ ...state, clients }, clientViewChanges(state.clients, clients));
};
