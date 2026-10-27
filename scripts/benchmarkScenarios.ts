import { hiddenGuestCommands, runHiddenOutput } from './benchmarkHidden.ts';
import { runIdle } from './benchmarkIdle.ts';
import type { ScenarioContext, ScenarioResult } from './benchmarkMeasure.ts';
import { paneListGuestCommands, runPaneList } from './benchmarkPaneList.ts';
import { runResizeBurst } from './benchmarkResize.ts';
import { runBusyScroll, scrollGuestCommands } from './benchmarkScroll.ts';
import { runTypingUnderFlood, typingGuestCommands } from './benchmarkTyping.ts';

export const scenarioNames = [
  'idle',
  'typingUnderFlood',
  'busyScroll',
  'hiddenOutput',
  'resizeBurst',
  'paneList',
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

export const scenarioRunners: Record<
  ScenarioName,
  (context: ScenarioContext) => Promise<ScenarioResult>
> = {
  idle: runIdle,
  typingUnderFlood: runTypingUnderFlood,
  busyScroll: runBusyScroll,
  hiddenOutput: runHiddenOutput,
  resizeBurst: runResizeBurst,
  paneList: runPaneList,
};

export const guestCommandTemplates = (floodBytes: number): Record<string, string> => ({
  ...typingGuestCommands(floodBytes),
  ...scrollGuestCommands(),
  ...hiddenGuestCommands(floodBytes),
  ...paneListGuestCommands(),
});
