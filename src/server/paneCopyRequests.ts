import type { PaneId } from '../ids.ts';
import { encodeControl } from '../protocol/protocol.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { rowsRangeText } from '../rows/rows.ts';
import type { State } from '../store/store.ts';
import type { Connection } from './connection.ts';
import type { Log } from './log.ts';
import { findLivePane } from './paneEffects.ts';
import { sendToForeground } from './paneNotice.ts';
import type { ForegroundContext } from './paneNotice.ts';
import type { RunningPane } from './paneRecord.ts';
import { maxReplyBytes, selectPaneRows } from './paneRows.ts';

interface PaneCopyContext extends ForegroundContext {
  options: { log: Log };
  state: State;
  runtime: ForegroundContext['runtime'] & {
    panes: Map<PaneId, RunningPane>;
  };
}

type PaneCopyMessage = Extract<ControlMessage, { type: 'paneCopy' }>;

type PaneCopyResult = Extract<ControlMessage, { type: 'paneCopyResult' }>['result'];

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

const tooLarge: PaneCopyResult = { ok: false, reason: 'tooLarge', oldest: undefined };

// The reply carries the text and more than the clipboardWrite does, so the reply's encoded size
// bounds both.
const fitsReply = (reply: ControlMessage): boolean => encodeControl(reply).length <= maxReplyBytes;

const answerPaneCopy = (
  context: PaneCopyContext,
  message: PaneCopyMessage,
  connection: Connection,
): void => {
  const { foregroundClientId } = context.state;
  const copied = copyTextOf(context, message);

  if (!copied.ok) {
    connection.send({ type: 'paneCopyResult', result: copied });

    return;
  }

  if (!message.print && foregroundClientId === undefined) {
    connection.send({
      type: 'paneCopyResult',
      result: { ok: false, reason: 'noClient', oldest: undefined },
    });

    return;
  }

  const clientId = message.print ? undefined : foregroundClientId;

  const reply: ControlMessage = {
    type: 'paneCopyResult',
    result: { ok: true, text: copied.text, clientId },
  };

  if (!fitsReply(reply)) {
    connection.send({ type: 'paneCopyResult', result: tooLarge });

    return;
  }

  if (!message.print) {
    sendToForeground(context, { type: 'clipboardWrite', text: copied.text });
  }

  connection.send(reply);
};

// Attached clients still show the frame from before a hold, so a copy waits for the hold to end.
export const handlePaneCopy = (
  context: PaneCopyContext,
  message: PaneCopyMessage,
  connection: Connection,
): void => {
  const live = findLivePane(context, message.paneId);

  if (live === undefined || !live.runtime.terminal.renderHeld()) {
    answerPaneCopy(context, message, connection);

    return;
  }

  live.publication.publisher
    .whenReleased()
    .then(() => {
      answerPaneCopy(context, message, connection);
    })
    .catch((error: unknown) => {
      context.options.log.error('Copying from the pane failed.', {
        paneId: message.paneId,
        error: describeError(error),
      });
    });
};
