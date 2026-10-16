import { runPaneCopy } from '../client/client.ts';
import type { PaneCopyCommand } from '../client/client.ts';
import type { ClientId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { connectionFailureMessage, print } from './output.ts';
import type { Outcome } from './output.ts';

type CopyFailure =
  | 'noServer'
  | 'refused'
  | 'connectionFailed'
  | 'noClient'
  | 'unknownPane'
  | 'pruned'
  | 'tooLarge';

type CopyOutput =
  | { copied: true; client: ClientId; text: string }
  | { text: string }
  | { copied: false; reason: CopyFailure; oldest?: number };

type CopyResult = Awaited<ReturnType<typeof runPaneCopy>>;

type Failure = Extract<CopyResult, { ok: false }>;

const isRefused = (
  failure: Failure,
): failure is { ok: false; reason: 'noClient' | 'unknownPane' | 'tooLarge' } =>
  failure.reason === 'noClient' ||
  failure.reason === 'unknownPane' ||
  failure.reason === 'tooLarge';

const refusedMessage = (
  request: PaneCopyCommand,
  reason: 'noClient' | 'unknownPane' | 'tooLarge',
  socketPath: string,
): string => {
  if (reason === 'noClient') {
    return `No client is attached to the server on ${socketPath}. Use --print to get the text.`;
  }

  return reason === 'unknownPane'
    ? `There is no pane ${request.pane}.`
    : 'The range holds too much text to copy. Choose a smaller range.';
};

const failureMessage = (request: PaneCopyCommand, failure: Failure, socketPath: string): string => {
  if (isRefused(failure)) {
    return refusedMessage(request, failure.reason, socketPath);
  }

  if (failure.reason === 'pruned') {
    return `Rows below row ${failure.oldest} are no longer kept. The oldest kept row is ${failure.oldest}.`;
  }

  return connectionFailureMessage(failure, socketPath, 'pane copy');
};

export const runPaneCopyCommand = async (
  json: boolean,
  request: PaneCopyCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPaneCopy(socketPath, version, request);

  if (!result.ok) {
    const message = failureMessage(request, result, socketPath);

    if (json) {
      const output: CopyOutput =
        result.reason === 'pruned'
          ? { copied: false, reason: result.reason, oldest: result.oldest }
          : { copied: false, reason: result.reason };

      print<CopyOutput>(true, { json: output, text: message });
    }

    return { ok: false, message };
  }

  if (request.print) {
    if (json) {
      print<CopyOutput>(true, { json: { text: result.text }, text: '' });
    } else {
      process.stdout.write(result.text);
    }

    return { ok: true };
  }

  const client = result.clientId;

  invariant(client !== undefined, 'The server copied text without naming a client.');

  print<CopyOutput>(json, {
    json: { copied: true, client, text: result.text },
    text: `Copied text of ${request.pane} to ${client}.`,
  });

  return { ok: true };
};
