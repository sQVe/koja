import { runPaneRead } from '../client/client.ts';
import type { PaneReadCommand } from '../client/client.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { connectionFailureMessage, print } from './output.ts';
import type { Outcome } from './output.ts';
import type { PaneCliCommand } from './paneCommandParse.ts';

type ReadFailure = Extract<
  Awaited<ReturnType<typeof runPaneRead>>,
  { reason: 'pruned' | 'staleEpoch' | 'screenChanged' | 'tooManyBytes' | 'noSnapshot' }
>;

interface PaneReadOutput {
  pane: string;
  source: 'visible' | 'recent' | 'recent-unwrapped';
  epoch: number;
  oldest: number;
  from: number | null;
  to: number | null;
  lines: string[];
}

const readFailureReasons: ReadonlySet<string> = new Set([
  'pruned',
  'staleEpoch',
  'screenChanged',
  'tooManyBytes',
  'noSnapshot',
]);

const isReadFailure = (
  result: Extract<Awaited<ReturnType<typeof runPaneRead>>, { ok: false }>,
): result is ReadFailure => readFailureReasons.has(result.reason);

const readFailureMessage = (failure: ReadFailure): string => {
  if (failure.reason === 'pruned') {
    return `Rows below row ${failure.oldest} are no longer kept. The oldest kept row is ${failure.oldest}.`;
  }

  if (failure.reason === 'staleEpoch') {
    return `The pane's rows were renumbered during the read. The epoch is now ${failure.epoch}. Read again.`;
  }

  if (failure.reason === 'screenChanged') {
    return 'The pane switched between its primary and alternate screens during the read. Read again.';
  }

  if (failure.reason === 'tooManyBytes') {
    return `A read holds at most ${failure.limitBytes} bytes. Read fewer rows.`;
  }

  return 'The server no longer holds the rows of this read. Read again.';
};

const sourceNames = {
  visible: 'visible',
  recent: 'recent',
  recentUnwrapped: 'recent-unwrapped',
} as const;

// Like herdr, nonempty recent and visible text ends in a line feed and unwrapped text gets none.
const printReadText = (read: PaneReadCommand, lines: string[]): void => {
  if (lines.length === 0) {
    return;
  }

  const text = lines.join('\n');

  process.stdout.write(read.source === 'recentUnwrapped' ? text : `${text}\n`);
};

export const runPaneReadCommand = async (
  command: PaneCliCommand,
  read: PaneReadCommand,
  version: BuildVersion,
  socketPath: string,
): Promise<Outcome> => {
  const result = await runPaneRead(socketPath, version, read);

  if (!result.ok && result.reason === 'paneMissing') {
    return { ok: false, message: 'The pane is no longer running.' };
  }

  if (!result.ok && isReadFailure(result)) {
    return { ok: false, message: readFailureMessage(result) };
  }

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'pane command') };
  }

  if (!command.json) {
    printReadText(read, result.lines);

    return { ok: true };
  }

  print<PaneReadOutput>(command.json, {
    json: {
      pane: result.paneId,
      source: sourceNames[read.source],
      epoch: result.epoch,
      oldest: result.oldest,
      from: result.from ?? null,
      to: result.to ?? null,
      lines: result.lines,
    },
    text: '',
  });

  return { ok: true };
};
