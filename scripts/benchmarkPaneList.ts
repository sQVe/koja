import { measure } from './benchmarkMeasure.ts';
import type { ScenarioContext, ScenarioGap, ScenarioResult } from './benchmarkMeasure.ts';

export const runPaneList = (context: ScenarioContext): Promise<ScenarioResult> =>
  measure(context, async () => {
    const latencyMs: number[] = [];
    const controlMs: number[] = [];
    const gaps: ScenarioGap[] = [];

    for (let index = 0; index < context.configuration.samples; index += 1) {
      const started = performance.now();
      // oxlint-disable-next-line eslint/no-await-in-loop -- each run is timed on its own.
      const listed = await context.koja('pane', 'list', '--json');

      if (listed.exitCode === 0) {
        latencyMs.push(performance.now() - started);
      } else {
        gaps.push({ metric: 'latencyMs', reason: listed.stderr });
      }

      const versionStarted = performance.now();

      // oxlint-disable-next-line eslint/no-await-in-loop -- each run is timed on its own.
      const version = await context.cli('--version');

      if (version.exitCode === 0) {
        controlMs.push(performance.now() - versionStarted);
      } else {
        gaps.push({ metric: 'controlMs', reason: version.stderr });
      }
    }

    return { latencyMs, controlMs, gaps };
  });

export const paneListGuestCommands = (): Record<string, string> => ({
  control: 'bun <root>/src/index.ts --version',
});
