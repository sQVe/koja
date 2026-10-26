import {
  floodCommand,
  floodTimeoutMs,
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

interface Completion {
  completionMs?: number;
  gap?: ScenarioGap;
}

// Ctrl+U makes the line discipline drop the typed marker.
const eraseLine = '\u0015';

// Starts watching before the flood is sent, so typing samples cannot delay the observation.
const watchCompletion = (
  context: ScenarioContext,
  text: string,
  started: number,
  timeoutMs: number,
): Promise<Completion> =>
  context.client.waitForText(text, timeoutMs).then(
    () => ({ completionMs: performance.now() - started }),
    (error: unknown) => ({ gap: { metric: 'completionMs', reason: messageOf(error) } }),
  );

// Times one fixed flood until its end marker appears; the watch starts before the flood is sent.
const timeCompletion = async (context: ScenarioContext, pane: string): Promise<Completion> => {
  const endMarker = marker('FLOOD-END');
  const bytes = context.configuration.floodBytes;
  const completion = watchCompletion(context, endMarker, performance.now(), floodTimeoutMs(bytes));

  await sendPaneCommand(context, pane, floodCommand(bytes, endMarker));

  return completion;
};

const typingSample = async (context: ScenarioContext, flood: SiblingFlood): Promise<Sample> => {
  if (!flood.running()) {
    return { ok: false, reason: 'The sibling flood ended before the typing sample.' };
  }

  const typedMarker = marker('TYPE');
  const typedAt = performance.now();
  let latencyMs: number;

  // The marker is never submitted, so only the echo of the typed keys can show it.
  context.client.type(typedMarker);

  try {
    await context.client.waitForText(typedMarker, readTimeoutMs);
    latencyMs = performance.now() - typedAt;
  } catch (error) {
    return { ok: false, reason: messageOf(error) };
  } finally {
    context.client.type(eraseLine);
  }

  if (!flood.running()) {
    return { ok: false, reason: 'The sibling flood ended during the typing sample.' };
  }

  return { ok: true, latencyMs };
};

const sampleTyping = async (
  context: ScenarioContext,
  flood: SiblingFlood,
  gaps: ScenarioGap[],
): Promise<number[]> => {
  const latencyMs: number[] = [];

  for (let index = 0; index < context.configuration.samples; index += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each sample needs the previous one.
    const sample = await typingSample(context, flood);

    if (sample.ok) {
      latencyMs.push(sample.latencyMs);
    } else {
      gaps.push({ metric: 'latencyMs', reason: sample.reason });
    }

    if (!flood.running()) {
      break;
    }
  }

  return latencyMs;
};

export const runTypingUnderFlood = (context: ScenarioContext): Promise<ScenarioResult> =>
  measure(context, async () => {
    const floodPane = paneAt(context, 1);
    const gaps: ScenarioGap[] = [];
    const completion = await timeCompletion(context, floodPane);

    if (completion.gap !== undefined) {
      gaps.push(completion.gap);
    }

    const flood = await startSiblingFlood(context, floodPane, 'TYPING');
    const latencyMs = await sampleTyping(context, flood, gaps);

    await flood.stop(gaps);

    return {
      latencyMs,
      ...(completion.completionMs === undefined ? {} : { completionMs: [completion.completionMs] }),
      gaps,
    };
  });

export const typingGuestCommands = (floodBytes: number): Record<string, string> => ({
  flood: floodCommand(floodBytes, '<FLOOD-END-MARKER>'),
  typingFlood: unboundedFloodCommand(`<run>/${floodSentinelName('TYPING')}`),
  typingStop: printMarkerCommand('<TYPING-STOP-MARKER>'),
});

export const typedInputTemplates = (): Record<string, string> => ({
  typing: '<TYPED-MARKER> then ctrl+u, never submitted',
});
