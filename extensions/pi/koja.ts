import { spawn } from 'node:child_process';

import { VERSION } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

type Environment = Record<string, string | undefined>;

type Ownership = 'interactive' | 'tauWorker';

type SwitchReason = 'reload' | 'new' | 'resume' | 'fork';

type ReportEvent =
  | { kind: 'start'; reason: 'startup' | SwitchReason }
  | { kind: 'tree' }
  | { kind: 'model' }
  | { kind: 'thinking' }
  | { kind: 'shutdown'; reason: 'quit' | SwitchReason };

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
  event: ReportEvent;
  sequence: number;
}

// pi loads this module again for each new session and reload inside the same process, so the
// sequence lives on the process's global object, where it keeps increasing.
const sequenceKey = Symbol.for('koja.piReportSequence');

const nextSequence = (): number => {
  // SAFETY: only this extension uses the registered symbol key, and it stores only numbers there.
  const holder = globalThis as Record<symbol, number | undefined>;
  const next = (holder[sequenceKey] ?? 0) + 1;

  holder[sequenceKey] = next;

  return next;
};

const ownershipOf = (workerRecord: string | undefined): Ownership =>
  workerRecord === undefined || workerRecord === '' ? 'interactive' : 'tauWorker';

const nonEmpty = (value: string | null | undefined): string | null =>
  value === undefined || value === '' ? null : value;

const reportOf = (
  pi: ExtensionAPI,
  context: ExtensionContext,
  environment: Environment,
  event: ReportEvent,
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
  event,
  sequence: nextSequence(),
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

  const report = (context: ExtensionContext, event: ReportEvent): void => {
    try {
      send(binaryPath, reportOf(pi, context, environment, event));
    } catch {
      // Reading pi's state must not affect pi.
    }
  };

  pi.on('session_start', (event, context) => {
    report(context, { kind: 'start', reason: event.reason });
  });

  pi.on('session_tree', (_event, context) => {
    report(context, { kind: 'tree' });
  });

  pi.on('model_select', (_event, context) => {
    report(context, { kind: 'model' });
  });

  pi.on('thinking_level_select', (_event, context) => {
    report(context, { kind: 'thinking' });
  });

  pi.on('session_shutdown', (event, context) => {
    report(context, { kind: 'shutdown', reason: event.reason });
  });
}
