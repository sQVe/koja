import { runPaneScroll } from '../client/client.ts';
import type { PaneScrollCommand } from '../client/client.ts';
import type { ClientId } from '../ids.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { connectionFailureMessage, print } from './output.ts';
import type { Outcome } from './output.ts';

type ScrollFailure =
  | 'noServer'
  | 'refused'
  | 'connectionFailed'
  | 'noClient'
  | 'unknownClient'
  | 'unknownPane';

type ScrollOutput =
  | { scrolled: true; client: ClientId; row: number | null }
  | { scrolled: false; reason: ScrollFailure };

type RefusedReason = 'noClient' | 'unknownClient' | 'unknownPane';

const failed = (json: boolean, reason: ScrollFailure, message: string): Outcome => {
  if (json) {
    print<ScrollOutput>(true, { json: { scrolled: false, reason }, text: message });
  }

  return { ok: false, message };
};

const refusedMessage = (
  request: PaneScrollCommand,
  reason: RefusedReason,
  socketPath: string,
): string => {
  if (reason === 'noClient') {
    return `No client is attached to the server on ${socketPath}.`;
  }

  return reason === 'unknownClient'
    ? `There is no client ${request.client ?? ''}.`
    : `There is no pane ${request.pane}.`;
};

const isRefused = (
  result: Extract<Awaited<ReturnType<typeof runPaneScroll>>, { ok: false }>,
): result is { ok: false; reason: RefusedReason } =>
  result.reason === 'noClient' ||
  result.reason === 'unknownClient' ||
  result.reason === 'unknownPane';

export const runPaneScrollCommand = async (
  json: boolean,
  request: PaneScrollCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPaneScroll(socketPath, version, request);

  if (!result.ok) {
    if (isRefused(result)) {
      return failed(json, result.reason, refusedMessage(request, result.reason, socketPath));
    }

    const message = connectionFailureMessage(result, socketPath, 'pane scroll');

    return failed(json, result.reason, message);
  }

  const position = result.topRow === undefined ? 'the bottom' : `row ${result.topRow}`;

  print<ScrollOutput>(json, {
    json: { scrolled: true, client: result.clientId, row: result.topRow ?? null },
    text: `Scrolled ${request.pane} in ${result.clientId} to ${position}.`,
  });

  return { ok: true };
};
