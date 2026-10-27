import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { encodeControl, payloadFitsFrame } from '../protocol/protocol.ts';
import { runPaneTargetRequest } from './clientRequest.ts';
import type { Request, RequestFailure } from './clientRequest.ts';

export type PanePasteMessage = Extract<ControlMessage, { type: 'panePaste' }>;

export interface PanePasteCommand {
  action: 'paste';
  text: string;
  pane?: PaneId | undefined;
  authorization: string | undefined;
}

export type PanePasteResult =
  | { ok: true; paneId: PaneId; generation: number }
  | {
      ok: false;
      reason: 'confirmationRequired';
      paneId: PaneId;
      generation: number;
      lines: number;
      authorization: string;
    }
  | { ok: false; reason: 'paneMissing'; paneId: PaneId | undefined }
  | { ok: false; reason: 'paneReplaced'; paneId: PaneId; generation: number }
  | { ok: false; reason: 'authorizationMismatch' }
  | { ok: false; reason: 'tooLarge' }
  | RequestFailure;

export type PanePasteCommandResult = Exclude<PanePasteResult, { reason: 'paneReplaced' }>;

type PasteOutcome = Extract<ControlMessage, { type: 'panePasteResult' }>['result'];

const isCommandResult = (result: PanePasteResult): result is PanePasteCommandResult =>
  result.ok || result.reason !== 'paneReplaced';

// The frame limit applies to the whole control message, so the check encodes it as it will be sent.
export const pasteFitsFrame = (message: PanePasteMessage): boolean =>
  payloadFitsFrame(encodeControl(message).length);

export const pasteResultOf = (outcome: PasteOutcome): PanePasteResult => {
  if (outcome.kind === 'sent') {
    return { ok: true, paneId: outcome.paneId, generation: outcome.generation };
  }

  if (outcome.kind === 'confirmationRequired') {
    const { kind, ...fields } = outcome;

    return { ok: false, reason: kind, ...fields };
  }

  if (outcome.kind === 'paneReplaced') {
    const { kind, ...fields } = outcome;

    return { ok: false, reason: kind, ...fields };
  }

  return outcome.kind === 'paneMissing'
    ? { ok: false, reason: 'paneMissing', paneId: outcome.paneId }
    : { ok: false, reason: 'authorizationMismatch' };
};

export const runPanePaste = (
  socketPath: string,
  version: BuildVersion,
  command: PanePasteCommand,
): Promise<PanePasteCommandResult> => {
  const send = (request: Request<PanePasteCommandResult>, paneId: PaneId): void => {
    const message: PanePasteMessage = {
      type: 'panePaste',
      paneId,
      generation: undefined,
      text: command.text,
      authorization: command.authorization,
    };

    if (!pasteFitsFrame(message)) {
      request.finish({ ok: false, reason: 'tooLarge' });

      return;
    }

    request.send(message);
  };

  return runPaneTargetRequest<PanePasteCommandResult>(socketPath, version, command.pane, {
    missing: { ok: false, reason: 'paneMissing', paneId: undefined },
    begin: send,
    onMessage: (request, message) => {
      if (message.type !== 'panePasteResult') {
        return;
      }

      const result = pasteResultOf(message.result);

      invariant(isCommandResult(result), 'A paste without a generation is never replaced.');

      request.finish(result);
    },
  });
};
