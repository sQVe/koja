import { measure } from './benchmarkMeasure.ts';
import type { ScenarioContext, ScenarioResult } from './benchmarkMeasure.ts';

export const runIdle = (context: ScenarioContext): Promise<ScenarioResult> =>
  measure(context, async () => {
    await Bun.sleep(context.configuration.idleDurationMs);

    return {};
  });
