import type { ClientId, PaneId } from '../ids.ts';
import type { State } from './store.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome } from './transitionOutcome.ts';
import { clientViewChanges } from './view.ts';

// Scrolls one client's view of a pane to the stable row at its top, or back to the bottom when
// the row is absent. A closed pane's position goes with the next scroll.
export const scrollPaneView = (
  state: State,
  id: ClientId,
  target: PaneId,
  row: number | undefined,
): Outcome => {
  if (!state.clients.some((client) => client.id === id)) {
    return refuse('unknownClient');
  }

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
