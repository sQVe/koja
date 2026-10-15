import type { ClientId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import type { State } from '../store/store.ts';
import type { Connection } from './connection.ts';

export interface ForegroundContext {
  state: Pick<State, 'foregroundClientId'>;
  runtime: { clientIds: Map<Connection, ClientId> };
}

// Sends a runtime effect of a pane to the foreground client alone. Without one, it is dropped.
export const sendToForeground = (context: ForegroundContext, message: ControlMessage): void => {
  const { foregroundClientId } = context.state;

  if (foregroundClientId === undefined) {
    return;
  }

  for (const [connection, id] of context.runtime.clientIds) {
    if (id === foregroundClientId && connection.isWelcomed() && !connection.isClosed()) {
      connection.send(message);
    }
  }
};
