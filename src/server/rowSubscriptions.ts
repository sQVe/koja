import type { ClientId, PaneId } from '../ids.ts';
import { layoutPanes, shownLayout } from '../layout.ts';
import { FrameKind } from '../protocol/protocol.ts';
import { encodeRowUpdate } from '../rows/rows.ts';
import { activeTabOf } from '../store/store.ts';
import type { State } from '../store/store.ts';
import type { Connection } from './connection.ts';
import type { Log } from './log.ts';
import type { RunningPane } from './paneRecord.ts';
import type { RowPublisher, RowSubscription } from './rowPublisher.ts';

export interface RowPublication {
  publisher: RowPublisher;
  pending: boolean;
}

export interface RowSubscriptions {
  // The panes this connection gets rows from.
  paneIds: readonly PaneId[];
  acknowledge: (pane: PaneId, sequence: number) => boolean;
  unsubscribe: () => void;
}

interface PublicationContext {
  options: { log: Log };
  state: Pick<State, 'stopping'>;
  runtime: { panes: Map<PaneId, RunningPane> };
}

interface SubscriptionContext extends PublicationContext {
  state: State;
  runtime: PublicationContext['runtime'] & {
    clientIds: Map<Connection, ClientId>;
    rowSubscriptions: Map<Connection, RowSubscriptions>;
  };
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const scheduleRows = (context: PublicationContext, id: PaneId, generation: number): void => {
  const publication = context.runtime.panes.get(id)?.publication;

  if (publication === undefined || publication.pending || context.state.stopping) {
    return;
  }

  publication.pending = true;

  setImmediate(() => {
    publication.pending = false;

    if (
      context.state.stopping ||
      context.runtime.panes.get(id)?.runtime.generation !== generation
    ) {
      return;
    }

    try {
      publication.publisher.publish();
    } catch (error) {
      context.options.log.error('Publishing pane rows failed.', {
        paneId: id,
        error: describeError(error),
      });
    }
  });
};

export const subscribeRows = (
  context: SubscriptionContext,
  connection: Connection,
  paneIds: readonly PaneId[],
): RowSubscriptions => {
  const subscriptions = new Map<PaneId, RowSubscription>();

  for (const id of paneIds) {
    const running = context.runtime.panes.get(id);

    if (running === undefined) {
      continue;
    }

    const subscription = running.publication.publisher.subscribe((update) => {
      if (connection.isClosed()) {
        return;
      }

      try {
        connection.sendBinary(FrameKind.rowUpdate, encodeRowUpdate(update));
      } catch (error) {
        context.options.log.error('Sending pane rows failed.', { error: describeError(error) });
        connection.close();
      }
    });

    subscriptions.set(id, subscription);
    scheduleRows(context, id, running.runtime.generation);
  }

  const acknowledge = (pane: PaneId, sequence: number): boolean =>
    subscriptions.get(pane)?.acknowledge(sequence) === true;

  const unsubscribe = (): void => {
    for (const subscription of subscriptions.values()) {
      subscription.unsubscribe();
    }
  };

  return { paneIds, acknowledge, unsubscribe };
};

// The panes the tab of the connection's own view shows that have a row publisher. A zoomed tab
// shows one pane. A connection that is no client yet, such as one that is attaching, follows the
// default view.
export const visiblePaneIds = (context: SubscriptionContext, connection: Connection): PaneId[] => {
  const { state, runtime } = context;
  const owner = runtime.clientIds.get(connection);
  const view = state.clients.find((client) => client.id === owner)?.view ?? state.defaultView;
  const tab = state.tabs.find((known) => known.id === activeTabOf(view, view.focusedWorkspaceId));

  if (tab === undefined) {
    return [];
  }

  const placed = layoutPanes(shownLayout(tab.layout, tab.zoomedPaneId), state.layoutArea);

  return placed.map((rectangle) => rectangle.paneId).filter((id) => runtime.panes.has(id));
};

const sameIds = (left: readonly PaneId[], right: readonly PaneId[]): boolean =>
  left.length === right.length && left.every((id) => right.includes(id));

// Moves each terminal connection to the visible panes. A new subscriber gets the full screen.
export const syncRowSubscriptions = (context: SubscriptionContext): void => {
  for (const [connection, current] of context.runtime.rowSubscriptions) {
    const visible = visiblePaneIds(context, connection);

    if (!sameIds(current.paneIds, visible)) {
      current.unsubscribe();
      context.runtime.rowSubscriptions.set(connection, subscribeRows(context, connection, visible));
    }
  }
};
