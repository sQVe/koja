import { spawn } from 'node:child_process';

import { VERSION } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

type Environment = Record<string, string | undefined>;

type Ownership = 'interactive' | 'tauWorker';

interface Report {
  processId: number;
  piVersion: string;
  sessionId: string | null;
  sessionFile: string | null;
  leafId: string | null;
  provider: string | null;
  model: string | null;
  thinkingLevel: string;
  ownership: Ownership;
}

// Tau marks its worker panes with a non-empty TAU_WORKER_RECORD.
const ownershipOf = (workerRecord: string | undefined): Ownership =>
  workerRecord === undefined || workerRecord === '' ? 'interactive' : 'tauWorker';

const nonEmpty = (value: string | null | undefined): string | null =>
  value === undefined || value === '' ? null : value;

// `koja pi report` refuses a missing key, so every absent value is null.
const reportOf = (
  pi: ExtensionAPI,
  context: ExtensionContext,
  environment: Environment,
): Report => ({
  processId: process.pid,
  piVersion: VERSION,
  sessionId: nonEmpty(context.sessionManager.getSessionId()),
  sessionFile: nonEmpty(context.sessionManager.getSessionFile()),
  leafId: nonEmpty(context.sessionManager.getLeafId()),
  provider: nonEmpty(context.model?.provider),
  model: nonEmpty(context.model?.id),
  thinkingLevel: pi.getThinkingLevel(),
  ownership: ownershipOf(environment.TAU_WORKER_RECORD),
});

// The report must never draw on pi's screen or keep pi waiting, so the command gets no terminal,
// pi does not wait for it, and every failure is dropped.
const send = (binaryPath: string, report: Report): void => {
  try {
    const child = spawn(binaryPath, ['pi', 'report'], { stdio: ['pipe', 'ignore', 'ignore'] });

    child.on('error', () => undefined);
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(report));
    child.unref();
  } catch {
    // A missing or broken Koja binary must not affect pi.
  }
};

export default function koja(pi: ExtensionAPI): void {
  // oxlint-disable-next-line node/no-process-env -- pi's environment is where the pane's Koja identity enters.
  const environment = process.env;
  const binaryPath = environment.KOJA_BIN_PATH;

  if (binaryPath === undefined || binaryPath === '') {
    return;
  }

  if (environment.KOJA_REPORT_TOKEN === undefined) {
    return;
  }

  pi.on('session_start', (_event, context) => {
    try {
      send(binaryPath, reportOf(pi, context, environment));
    } catch {
      // Reading pi's state must not affect pi.
    }
  });
}
