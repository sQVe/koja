import type { ClientId, PaneId } from '../ids.ts';
import type { TerminalSize } from '../layout.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import type { Change, DetachReason, Intent, State } from '../store/store.ts';
import type { Connection } from './connection.ts';
import type { Log } from './log.ts';
import type { PaneRuntime } from './pane.ts';
import { findLivePane } from './paneEffects.ts';
import type { RowSubscriptions } from './rowSubscriptions.ts';

interface ClientRequestContext {
  options: { log: Log };
  state: State;
  runtime: {
    panes: Map<PaneId, PaneRuntime>;
    clientIds: Map<Connection, ClientId>;
    rowSubscriptions: Map<Connection, RowSubscriptions>;
  };
}

type Dispatch = (intent: Intent) => readonly Change[];

type PaneScrollMessage = Extract<ControlMessage, { type: 'paneScroll' }>;

export const handleDetach = (
  context: ClientRequestContext,
  message: Extract<ControlMessage, { type: 'detach' }>,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const { clients, foregroundClientId } = context.state;
  const requestedId = message.clientId;
  const unknownClient = requestedId !== undefined && !clients.some(({ id }) => id === requestedId);
  const targetId = requestedId ?? foregroundClientId;

  if (unknownClient || targetId === undefined) {
    const reason = unknownClient ? 'unknownClient' : 'noClient';

    connection.send({ type: 'detachResult', result: { ok: false, reason } });

    return;
  }

  // Answer first: the sender may be the target client, and its detach closes the connection.
  connection.send({ type: 'detachResult', result: { ok: true } });
  dispatch({ type: 'detachClient', clientId: targetId });
};

// Resolves `top` to the oldest row the pane keeps, a row at or past the active top to the bottom,
// and a row older than the oldest to the oldest, so the store never reads the terminal.
const scrollRowOf = (
  context: ClientRequestContext,
  message: PaneScrollMessage,
): number | undefined => {
  if (message.to === 'bottom') {
    return undefined;
  }

  const stable = findLivePane(context, message.paneId)?.runtime.terminal.stableRows();

  if (message.to === 'top') {
    return stable?.first ?? 0;
  }

  if (stable === undefined) {
    return message.to;
  }

  return message.to >= stable.activeTop ? undefined : Math.max(message.to, stable.first);
};

export const handlePaneScroll = (
  context: ClientRequestContext,
  message: PaneScrollMessage,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const { clients, foregroundClientId, panes } = context.state;
  const requestedId = message.clientId;
  const unknownClient = requestedId !== undefined && !clients.some(({ id }) => id === requestedId);
  const targetId = requestedId ?? foregroundClientId;

  if (unknownClient || targetId === undefined) {
    const reason = unknownClient ? 'unknownClient' : 'noClient';

    connection.send({ type: 'paneScrollResult', result: { ok: false, reason } });

    return;
  }

  if (!panes.some(({ id }) => id === message.paneId)) {
    connection.send({ type: 'paneScrollResult', result: { ok: false, reason: 'unknownPane' } });

    return;
  }

  const row = scrollRowOf(context, message);

  dispatch({ type: 'scrollPane', clientId: targetId, paneId: message.paneId, row });

  connection.send({
    type: 'paneScrollResult',
    result: { ok: true, clientId: targetId, topRow: row },
  });
};

export const handleClientSetting = (
  context: ClientRequestContext,
  message: Extract<ControlMessage, { type: 'resize' | 'theme' }>,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const clientId = context.runtime.clientIds.get(connection);

  if (clientId === undefined) {
    return;
  }

  if (message.type === 'resize') {
    dispatch({ type: 'resizeClient', clientId, size: message.size });
  } else {
    dispatch({ type: 'setClientTheme', clientId, theme: message.theme });
  }
};

// A terminal connection is a client, so its focus and create intents move its own view. Any other
// connection is the CLI, whose intents move every view.
export const sourceOf = (
  context: { runtime: { clientIds: Map<Connection, ClientId> } },
  connection: Connection,
): { clientId?: ClientId } => {
  const clientId = context.runtime.clientIds.get(connection);

  return clientId === undefined ? {} : { clientId };
};

export const handleAck = (
  context: ClientRequestContext,
  pane: PaneId,
  sequence: number,
  connection: Connection,
): void => {
  const accepted = context.runtime.rowSubscriptions.get(connection)?.acknowledge(pane, sequence);

  if (accepted !== true) {
    context.options.log.debug('Ignored an ack for a pane or sequence the client was not sent.', {
      pane,
      sequence,
    });
  }
};

// A terminal client that sends input or a request of its own becomes the foreground client.
export const markActive = (
  context: ClientRequestContext,
  connection: Connection,
  dispatch: Dispatch,
): void => {
  const clientId = context.runtime.clientIds.get(connection);

  if (clientId !== undefined) {
    dispatch({ type: 'markClientActive', clientId });
  }
};

// Forgets the client first, so closing its socket does not detach it a second time.
export const closeDetachedClient = (
  context: Pick<ClientRequestContext, 'runtime'>,
  detachedId: ClientId,
  reason: DetachReason,
): void => {
  const { clientIds } = context.runtime;

  for (const [connection, id] of clientIds) {
    if (id === detachedId) {
      clientIds.delete(connection);
      connection.send({ type: reason === 'takenOver' ? 'takenOver' : 'detached' });
      connection.closeWhenFlushed();
    }
  }
};

export const attachTerminal = (
  context: Pick<ClientRequestContext, 'runtime'>,
  connection: Connection,
  size: TerminalSize,
  dispatch: Dispatch,
  syncRowSubscriptions: () => void,
): void => {
  const changes = dispatch({ type: 'attachClient', size });
  const attached = changes.find((change) => change.type === 'clientAttached');

  if (attached !== undefined) {
    context.runtime.clientIds.set(connection, attached.client.id);
    syncRowSubscriptions();
  }
};
