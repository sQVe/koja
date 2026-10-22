import { runPaneScroll } from '../client/client.ts';
import type { PaneScrollCommand } from '../client/client.ts';
import type { ClientId } from '../ids.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { connectionFailureMessage, printJson } from './output.ts';
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

const failed = (reason: ScrollFailure, message: string): Outcome => {
  printJson({ scrolled: false, reason } satisfies ScrollOutput);

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
  request: PaneScrollCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPaneScroll(socketPath, version, request);

  if (!result.ok) {
    if (isRefused(result)) {
      return failed(result.reason, refusedMessage(request, result.reason, socketPath));
    }

    const message = connectionFailureMessage(result, socketPath, 'pane scroll');

    return failed(result.reason, message);
  }

  printJson({
    scrolled: true,
    client: result.clientId,
    row: result.topRow ?? null,
  } satisfies ScrollOutput);

  return { ok: true };
};
