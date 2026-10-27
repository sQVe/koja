import { paneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { applyFact, applyIntent, createState } from '../store/store.ts';
import type { PiReport, State } from '../store/store.ts';
import type { Connection } from './connection.ts';
import type { RunningPane } from './paneRecord.ts';
import { handlePiReport } from './piReports.ts';
import { readStat } from './processGroups.ts';
import type { ProcessStat } from './processGroups.ts';

type PiReportContext = Parameters<typeof handlePiReport>[0];

interface PiReportFixture {
  context: PiReportContext;
  connection: Connection;
  messages: ControlMessage[];
  warnings: unknown[];
  running: RunningPane;
  processStat: ProcessStat;
  starting: State;
  sendReport: (changes?: Partial<PiReport>) => void;
}

const target = paneId(1);
const passLength = 64;
const pass = 'a'.repeat(passLength);

const report: PiReport = {
  processId: process.pid,
  piVersion: '1.4.0',
  sessionId: undefined,
  sessionFile: undefined,
  leafId: undefined,
  provider: undefined,
  model: undefined,
  thinkingLevel: 'off',
  ownership: 'tauWorker',
  event: { kind: 'start', reason: 'startup' },
  sequence: 1,
};

const { processId: _processId, event: _event, sequence: _sequence, ...identity } = report;

const fixture = (): PiReportFixture => {
  const created = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/tmp',
    label: undefined,
    focus: true,
  });

  const processStat = readStat(String(process.pid));

  invariant(processStat !== undefined, 'Cannot read this process.');

  const [createdPane] = created.state.panes;

  invariant(createdPane !== undefined, 'The created workspace has no pane.');

  const { state } = applyFact(created.state, {
    type: 'paneStarted',
    paneId: target,
    generation: createdPane.generation,
  });

  const [startedPane] = state.panes;

  invariant(startedPane !== undefined, 'The started pane is missing.');

  const messages: ControlMessage[] = [];
  const warnings: unknown[] = [];

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fixture omits the terminal, PTY, and row publisher.
  const running = {
    reportPass: pass,
    runtime: { generation: startedPane.generation, processId: processStat.session },
  } as RunningPane;

  const context: PiReportContext = {
    state,
    runtime: { panes: new Map([[target, running]]) },
    options: {
      log: {
        debug: () => undefined,
        info: () => undefined,
        error: () => undefined,
        warn: (_message: string, fields: unknown) => {
          warnings.push(fields);
        },
      },
    },
  };

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fixture omits the other Connection methods.
  const connection = {
    send: (message: ControlMessage) => {
      messages.push(message);
    },
  } as Connection;

  const sendReport = (changes: Partial<PiReport> = {}): void => {
    handlePiReport(
      context,
      { type: 'piReport', paneId: target, token: pass, report: { ...report, ...changes } },
      connection,
    );
  };

  return {
    context,
    connection,
    messages,
    warnings,
    running,
    processStat,
    starting: created.state,
    sendReport,
  };
};

export { fixture, identity, pass, report, target };
