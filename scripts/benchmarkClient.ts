import { join } from 'node:path';

import type { Terminal } from '../src/vt/vt.ts';
import { startAttachTerminal } from './attachTerminal.ts';
import { placementCommand } from './benchmarkMachine.ts';
import type { Placement } from './benchmarkMachine.ts';
import { attachArguments, repositoryRoot } from './benchmarkServer.ts';

export interface BenchmarkClient {
  processId: number;
  text: () => string;
  type: (input: string) => void;
  resize: (columns: number, rows: number) => void;
  waitFor: (condition: () => boolean, description: string, timeoutMs?: number) => Promise<number>;
  waitForText: (text: string, timeoutMs?: number) => Promise<number>;
  stop: () => Promise<void>;
}

interface AttachOptions {
  socketPath: string;
  environment: Record<string, string | undefined>;
  placement: Placement;
  columns: number;
  rows: number;
}

const waitTimeoutMs = 30_000;

const failureTextRows = 20;

const lastRows = (screen: Terminal): string =>
  screen
    .text()
    .split('\n')
    .slice(-failureTextRows)
    .map((line, index) => `${index}|${line}`)
    .join('\n');

export const attachBenchmarkClient = (options: AttachOptions): BenchmarkClient => {
  const terminal = startAttachTerminal({
    command: placementCommand(options.placement, [
      process.execPath,
      join(repositoryRoot, 'src/index.ts'),
      ...attachArguments(options.socketPath),
    ]),
    cwd: repositoryRoot,
    environment: options.environment,
    columns: options.columns,
    rows: options.rows,
  });

  const waitFor = (
    condition: () => boolean,
    description: string,
    timeout = waitTimeoutMs,
  ): Promise<number> =>
    terminal.waitFor(
      condition,
      timeout,
      () => `${description} did not happen in ${timeout} ms. Screen:\n${lastRows(terminal.screen)}`,
    );

  return {
    processId: terminal.processId,
    text: () => terminal.screen.text(),
    type: terminal.type,
    resize: terminal.resize,
    waitFor,
    waitForText: (text, timeout) =>
      waitFor(
        () => terminal.screen.text().includes(text),
        `The screen did not show ${text}`,
        timeout,
      ),
    stop: terminal.stop,
  };
};
