import {
  lastLine,
  marker,
  measure,
  messageOf,
  paneAt,
  printMarkerCommand,
  readTimeoutMs,
  sendPaneCommand,
  startSiblingFlood,
  floodSentinelName,
  unboundedFloodCommand,
} from './benchmarkMeasure.ts';
import type {
  Sample,
  ScenarioContext,
  ScenarioGap,
  ScenarioResult,
  SiblingFlood,
} from './benchmarkMeasure.ts';

const scrollPrefix = '\x02[';

const firstScrollRow = 'scrollrow-000001';

const scrollHistoryRows = 4_000;

const scrollHistoryCommand = (endMarker: string): string => {
  const clear = "printf '\\033[2J\\033[3J\\033[H'";

  return `${clear}; seq -f 'scrollrow-%06g' 1 ${scrollHistoryRows}; ${printMarkerCommand(endMarker)}`;
};

const leaveScrollMode = async (
  context: ScenarioContext,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  context.client.type('q');

  try {
    await context.client.waitFor(
      () =>
        lastLine(context).startsWith('INSERT') && !context.client.text().includes(firstScrollRow),
      'The client did not leave scroll mode',
      readTimeoutMs,
    );

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: messageOf(error) };
  }
};

// Returns why the history was not written, or undefined once its end marker is on screen.
const writeHistory = async (
  context: ScenarioContext,
  pane: string,
): Promise<string | undefined> => {
  const endMarker = marker('HISTORY-END');

  await sendPaneCommand(context, pane, scrollHistoryCommand(endMarker));

  try {
    await context.client.waitForText(endMarker, readTimeoutMs);

    return undefined;
  } catch (error) {
    return messageOf(error);
  }
};

// Data events drive the wait, so with the row absent before the input only a new frame can match.
const scrollSample = async (context: ScenarioContext, flood: SiblingFlood): Promise<Sample> => {
  if (!flood.running()) {
    return { ok: false, reason: 'The sibling flood ended before the scroll sample.' };
  }

  if (!lastLine(context).startsWith('INSERT') || context.client.text().includes(firstScrollRow)) {
    return { ok: false, reason: 'The first history row was on screen before scroll mode started.' };
  }

  const scrolledAt = performance.now();

  context.client.type(`${scrollPrefix}g`);

  try {
    await context.client.waitFor(
      () =>
        lastLine(context).startsWith('SCROLL') && context.client.text().includes(firstScrollRow),
      'The client did not show the first history row in scroll mode',
      readTimeoutMs,
    );

    return { ok: true, latencyMs: performance.now() - scrolledAt };
  } catch (error) {
    return { ok: false, reason: messageOf(error) };
  }
};

const sampleScrolling = async (
  context: ScenarioContext,
  flood: SiblingFlood,
  gaps: ScenarioGap[],
): Promise<number[]> => {
  const latencyMs: number[] = [];

  for (let index = 0; index < context.configuration.samples; index += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each sample needs the previous one.
    const sample = await scrollSample(context, flood);

    if (sample.ok) {
      latencyMs.push(sample.latencyMs);
    } else {
      gaps.push({ metric: 'latencyMs', reason: sample.reason });
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- leaving must finish before the next sample.
    const left = await leaveScrollMode(context);

    if (!left.ok) {
      gaps.push({ metric: 'latencyMs', reason: left.reason });

      break;
    }

    if (!flood.running()) {
      gaps.push({
        metric: 'latencyMs',
        reason: 'The sibling flood ended during the scroll sample.',
      });

      break;
    }
  }

  return latencyMs;
};

export const runBusyScroll = (context: ScenarioContext): Promise<ScenarioResult> =>
  measure(context, async () => {
    const floodPane = paneAt(context, 1);
    const gaps: ScenarioGap[] = [];
    const historyFailure = await writeHistory(context, context.panes.focused);

    if (historyFailure !== undefined) {
      return { latencyMs: [], gaps: [{ metric: 'latencyMs', reason: historyFailure }] };
    }

    const flood = await startSiblingFlood(context, floodPane, 'SCROLL');
    const latencyMs = await sampleScrolling(context, flood, gaps);

    if (!lastLine(context).startsWith('INSERT')) {
      await leaveScrollMode(context);
    }

    await flood.stop(gaps);

    return { latencyMs, gaps };
  });

export const scrollGuestCommands = (): Record<string, string> => ({
  scrollFlood: unboundedFloodCommand(`<run>/${floodSentinelName('SCROLL')}`),
  scrollHistory: scrollHistoryCommand('<HISTORY-END-MARKER>'),
  scrollStop: printMarkerCommand('<SCROLL-STOP-MARKER>'),
});
