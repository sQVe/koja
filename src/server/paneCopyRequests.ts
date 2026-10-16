import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { rowsRangeText } from '../rows/rows.ts';
import type { State } from '../store/store.ts';
import type { Connection } from './connection.ts';
import type { PaneRuntime } from './pane.ts';
import { findLivePane } from './paneEffects.ts';
import { sendToForeground } from './paneNotice.ts';
import type { ForegroundContext } from './paneNotice.ts';
import { selectPaneRows } from './paneRows.ts';

interface PaneCopyContext extends ForegroundContext {
  state: State;
  runtime: ForegroundContext['runtime'] & { panes: Map<PaneId, PaneRuntime> };
}

type PaneCopyMessage = Extract<ControlMessage, { type: 'paneCopy' }>;

type PaneCopyResult = Extract<ControlMessage, { type: 'paneCopyResult' }>['result'];

const copyTextOf = (context: PaneCopyContext, message: PaneCopyMessage): PaneCopyResult => {
  const live = findLivePane(context, message.paneId);

  if (live === undefined) {
    return { ok: false, reason: 'unknownPane', oldest: undefined };
  }

  const { start, end } = message;

  const selected = selectPaneRows(live.runtime.terminal, live.pane.size, {
    source: 'range',
    from: start.row,
    to: end.row,
    epoch: undefined,
    screen: undefined,
  });

  if (!selected.ok && selected.failure.reason === 'pruned') {
    return { ok: false, reason: 'pruned', oldest: selected.failure.oldest };
  }

  if (!selected.ok) {
    return { ok: false, reason: 'tooLarge', oldest: undefined };
  }

  const { rows } = selected;

  const text = rowsRangeText(
    rows,
    rows.columns,
    { row: start.row - rows.first, column: start.column },
    { row: end.row - rows.first, column: end.column },
  );

  return { ok: true, text, clientId: undefined };
};

export const handlePaneCopy = (
  context: PaneCopyContext,
  message: PaneCopyMessage,
  connection: Connection,
): void => {
  const { foregroundClientId } = context.state;
  const copied = copyTextOf(context, message);

  if (!copied.ok || message.print) {
    connection.send({ type: 'paneCopyResult', result: copied });

    return;
  }

  if (foregroundClientId === undefined) {
    connection.send({
      type: 'paneCopyResult',
      result: { ok: false, reason: 'noClient', oldest: undefined },
    });

    return;
  }

  sendToForeground(context, { type: 'clipboardWrite', text: copied.text });

  connection.send({
    type: 'paneCopyResult',
    result: { ok: true, text: copied.text, clientId: foregroundClientId },
  });
};
