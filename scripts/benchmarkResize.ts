import { lastLine, measure, messageOf, readTimeoutMs } from './benchmarkMeasure.ts';
import type { ScenarioContext, ScenarioGap, ScenarioResult } from './benchmarkMeasure.ts';

const resizeColumnsDelta = 10;

const resizeRowsDelta = 5;

const resizeVariantColumns = 3;

const resizeVariantRows = 2;

const resizeVariantOffset = 2;

const bottomFrameOffset = 2;

const hasFrameAt = (context: ScenarioContext, columns: number, rows: number): boolean => {
  const lines = context.client.text().split('\n');

  const frame = lines[rows - bottomFrameOffset];
  const atSize = lines.length === rows;
  const statusAtBottom = lastLine(context).startsWith('INSERT');
  const frameAtWidth = frame?.length === columns && frame.endsWith('┘');

  return atSize && statusAtBottom && frameAtWidth;
};

const resizeBurst = (context: ScenarioContext, finalColumns: number, finalRows: number): void => {
  const { columns, rows } = context.configuration;

  for (let index = 0; index < context.configuration.resizeCount; index += 1) {
    context.client.resize(
      columns - resizeVariantOffset + (index % resizeVariantColumns),
      rows - resizeVariantOffset + (index % resizeVariantRows),
    );
  }

  context.client.resize(finalColumns, finalRows);
};

const restoreSize = async (
  context: ScenarioContext,
  columns: number,
  rows: number,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  context.client.resize(columns, rows);

  try {
    await context.client.waitFor(
      () => hasFrameAt(context, columns, rows),
      'The client did not draw the restored size',
      readTimeoutMs,
    );

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: messageOf(error) };
  }
};

export const runResizeBurst = (context: ScenarioContext): Promise<ScenarioResult> =>
  measure(context, async () => {
    const { columns, rows, samples } = context.configuration;
    const finalColumns = columns + resizeColumnsDelta;
    const finalRows = rows + resizeRowsDelta;
    const latencyMs: number[] = [];
    const gaps: ScenarioGap[] = [];

    for (let index = 0; index < samples; index += 1) {
      const started = performance.now();

      resizeBurst(context, finalColumns, finalRows);

      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each burst must finish before the next.
        await context.client.waitFor(
          () => hasFrameAt(context, finalColumns, finalRows),
          'The client did not draw a frame at the final size',
          readTimeoutMs,
        );

        latencyMs.push(performance.now() - started);
      } catch (error) {
        gaps.push({ metric: 'latencyMs', reason: messageOf(error) });
      }

      // oxlint-disable-next-line eslint/no-await-in-loop -- the next burst starts from the restored size.
      const restored = await restoreSize(context, columns, rows);

      if (!restored.ok) {
        gaps.push({ metric: 'latencyMs', reason: restored.reason });

        break;
      }
    }

    return { latencyMs, gaps };
  });
