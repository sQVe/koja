import {
  floodTimeoutMs,
  marker,
  measure,
  messageOf,
  printMarkerCommand,
  sendPaneCommand,
} from './benchmarkMeasure.ts';
import type { ScenarioContext, ScenarioGap, ScenarioResult } from './benchmarkMeasure.ts';

const hiddenPollMs = 50;

const hiddenCommand = (bytes: number, endMarker: string): string =>
  `head -c ${bytes} /dev/zero | tr '\\0' h; ${printMarkerCommand(endMarker)}`;

const readPane = async (context: ScenarioContext, pane: string): Promise<string> => {
  const read = await context.koja('pane', 'read', pane, '--lines', '1000');

  if (read.exitCode !== 0) {
    throw new Error(`Reading ${pane} failed: ${read.stderr}`);
  }

  return read.stdout;
};

const waitForHiddenMarker = async (
  context: ScenarioContext,
  pane: string,
  text: string,
  started: number,
  timeoutMs: number,
): Promise<{ completionMs?: number; gap?: ScenarioGap }> => {
  while (performance.now() - started < timeoutMs) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one poll finishes before the next starts.
      const paneText = await readPane(context, pane);

      if (paneText.includes(text)) {
        return { completionMs: performance.now() - started };
      }
    } catch (error) {
      return { gap: { metric: 'completionMs', reason: messageOf(error) } };
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- one poll finishes before the next starts.
    await Bun.sleep(hiddenPollMs);
  }

  return {
    gap: {
      metric: 'completionMs',
      reason: `The hidden pane did not show its end marker within ${timeoutMs} ms.`,
    },
  };
};

export const runHiddenOutput = (context: ScenarioContext): Promise<ScenarioResult> =>
  measure(context, async () => {
    const pane = context.panes.hidden;
    const bytes = context.configuration.floodBytes;
    const completionMs: number[] = [];
    const gaps: ScenarioGap[] = [];

    for (let index = 0; index < context.configuration.samples; index += 1) {
      const endMarker = marker('HIDDEN-END');
      const started = performance.now();

      // oxlint-disable-next-line eslint/no-await-in-loop -- each sample sends one command.
      await sendPaneCommand(context, pane, hiddenCommand(bytes, endMarker));

      // oxlint-disable-next-line eslint/no-await-in-loop -- each sample needs the previous one.
      const completion = await waitForHiddenMarker(
        context,
        pane,
        endMarker,
        started,
        floodTimeoutMs(bytes),
      );

      if (completion.completionMs !== undefined) {
        completionMs.push(completion.completionMs);
      } else if (completion.gap !== undefined) {
        gaps.push(completion.gap);
      }
    }

    return { completionMs, gaps };
  });

export const hiddenGuestCommands = (floodBytes: number): Record<string, string> => ({
  hidden: hiddenCommand(floodBytes, '<HIDDEN-END-MARKER>'),
});
