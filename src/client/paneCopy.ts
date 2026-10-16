import type { ClientId, PaneId } from '../ids.ts';
import type { BuildVersion, ControlMessage } from '../protocol/protocol.ts';
import { runRequest } from './clientRequest.ts';
import type { RequestFailure } from './clientRequest.ts';

// Rows are stable row numbers and columns start at 0. Both ends are inclusive.
export interface PaneCopyCommand {
  action: 'copy';
  pane: PaneId;
  start: { row: number; column: number };
  end: { row: number; column: number };
  print: boolean;
}

export type PaneCopyResult =
  | { ok: true; text: string; clientId: ClientId | undefined }
  | { ok: false; reason: 'noClient' | 'unknownPane' | 'tooLarge' }
  | { ok: false; reason: 'pruned'; oldest: number }
  | RequestFailure;

const copyResultOf = (
  result: Extract<ControlMessage, { type: 'paneCopyResult' }>['result'],
): PaneCopyResult => {
  if (result.ok) {
    return result;
  }

  return result.reason === 'pruned'
    ? { ok: false, reason: 'pruned', oldest: result.oldest ?? 0 }
    : { ok: false, reason: result.reason };
};

// Fails with `noClient` when it copies and no client is in the foreground, `unknownPane` when the
// pane is unknown, `pruned` when the range starts below the oldest row kept, and `tooLarge` when
// the text does not fit in one reply. With print, it returns the text and no client gets it.
export const runPaneCopy = (
  socketPath: string,
  version: BuildVersion,
  command: PaneCopyCommand,
): Promise<PaneCopyResult> =>
  runRequest<PaneCopyResult>(socketPath, version, {
    onWelcome: (request) => {
      request.send({
        type: 'paneCopy',
        paneId: command.pane,
        start: command.start,
        end: command.end,
        print: command.print,
      });
    },
    onMessage: (request, message) => {
      if (message.type === 'paneCopyResult') {
        request.finish(copyResultOf(message.result));
      }
    },
  });
