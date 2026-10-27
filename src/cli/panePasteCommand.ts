import { runPanePaste } from '../client/client.ts';
import type { PanePasteCommand, PanePasteCommandResult } from '../client/client.ts';
import type { PaneId } from '../ids.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { connectionFailureMessage, printJson } from './output.ts';
import type { Outcome } from './output.ts';

type PasteRefusal = Exclude<
  PanePasteCommandResult,
  { ok: true } | { reason: 'noServer' | 'connectionFailed' | 'refused' }
>;

type PasteOutput =
  | { status: 'sent'; pane: PaneId; generation: number }
  | {
      status: 'confirmationRequired';
      pane: PaneId;
      generation: number;
      lines: number;
      authorization: string;
    }
  | { status: 'paneMissing'; pane: PaneId | null }
  | { status: 'authorizationMismatch' };

const connectionFailures: ReadonlySet<string> = new Set([
  'noServer',
  'connectionFailed',
  'refused',
]);

const isRefusal = (result: PanePasteCommandResult): result is PasteRefusal =>
  !result.ok && !connectionFailures.has(result.reason);

const refusalOutput = (refusal: PasteRefusal): PasteOutput => {
  if (refusal.reason === 'confirmationRequired') {
    const { generation, lines, authorization } = refusal;

    return { status: refusal.reason, pane: refusal.paneId, generation, lines, authorization };
  }

  return refusal.reason === 'paneMissing'
    ? { status: refusal.reason, pane: refusal.paneId ?? null }
    : { status: refusal.reason };
};

const refusalMessage = (refusal: PasteRefusal): string => {
  if (refusal.reason === 'confirmationRequired') {
    return (
      `The text has ${refusal.lines} lines, and ${refusal.paneId} does not take bracketed paste, ` +
      `so each line may run as a command. To send it, run the same command with --authorize ` +
      `${refusal.authorization}.`
    );
  }

  if (refusal.reason === 'paneMissing') {
    return 'The pane is no longer running.';
  }

  return 'The authorization does not match this text and pane. Nothing was sent.';
};

export const runPanePasteCommand = async (
  json: boolean,
  command: PanePasteCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPanePaste(socketPath, version, command);

  if (result.ok) {
    if (json) {
      printJson({
        status: 'sent',
        pane: result.paneId,
        generation: result.generation,
      } satisfies PasteOutput);
    }

    return { ok: true };
  }

  if (!isRefusal(result)) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'pane paste') };
  }

  if (json) {
    printJson(refusalOutput(result));
  }

  return { ok: false, message: refusalMessage(result) };
};
