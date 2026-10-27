import type { PaneId } from '../ids.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { runRequest } from './clientRequest.ts';
import type { Request, RequestFailure } from './clientRequest.ts';
import { focusedPane } from './snapshot.ts';

// Without a pane id, the command targets the focused pane. Without a generation, it pastes into
// whichever generation of the pane runs.
export interface PanePasteCommand {
  action: 'paste';
  text: string;
  pane?: PaneId | undefined;
  generation?: number | undefined;
  authorization: string | undefined;
}

// paneId is undefined for paneMissing when no pane was given and no running pane has focus.
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
  | RequestFailure;

type PasteOutcome = Extract<ControlMessage, { type: 'panePasteResult' }>['result'];

const pasteResultOf = (outcome: PasteOutcome): PanePasteResult => {
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

// Multiline text for a program without bracketed paste fails with confirmationRequired and
// reaches the pane only when sent again with the authorization that result holds.
export const runPanePaste = (
  socketPath: string,
  version: BuildVersion,
  command: PanePasteCommand,
): Promise<PanePasteResult> => {
  const send = (request: Request<PanePasteResult>, paneId: PaneId): void => {
    request.send({
      type: 'panePaste',
      paneId,
      generation: command.generation,
      text: command.text,
      authorization: command.authorization,
    });
  };

  return runRequest<PanePasteResult>(socketPath, version, {
    onWelcome: (request) => {
      if (command.pane !== undefined) {
        send(request, command.pane);
      }
    },
    onMessage: (request, message) => {
      if (message.type === 'panePasteResult') {
        request.finish(pasteResultOf(message.result));

        return;
      }

      if (message.type !== 'snapshot' || command.pane !== undefined) {
        return;
      }

      const focused = focusedPane(message.snapshot);

      if (focused?.lifecycle === 'running') {
        send(request, focused.id);
      } else {
        request.finish({ ok: false, reason: 'paneMissing', paneId: undefined });
      }
    },
  });
};
