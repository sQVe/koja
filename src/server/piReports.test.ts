import { expect, it, onTestFinished, spyOn } from 'bun:test';

import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { applyFact, applyIntent, applyPiReport, createState } from '../store/store.ts';
import type { PiReport } from '../store/store.ts';
import type { Connection } from './connection.ts';
import type { RunningPane } from './paneRecord.ts';
import { answerPiStatus, handlePiReport } from './piReports.ts';
import * as processGroups from './processGroups.ts';
import { parseStat, readStat } from './processGroups.ts';

const target = paneId(1);
const pass = 'a'.repeat(64);

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
};

const fixture = () => {
  const created = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/tmp',
    label: undefined,
    focus: true,
  });

  const processStat = readStat(String(process.pid));

  if (processStat === undefined) {
    throw new Error('Cannot read this process.');
  }

  const { state } = applyFact(created.state, {
    type: 'paneStarted',
    paneId: target,
    generation: created.state.panes[0]!.generation,
  });

  const messages: ControlMessage[] = [];
  const warnings: unknown[] = [];

  const running = {
    reportPass: pass,
    runtime: { generation: state.panes[0]!.generation, processId: processStat.session },
  } as RunningPane;

  const context = {
    state,
    runtime: { panes: new Map([[target, running]]) },
    options: {
      log: {
        debug: () => {},
        info: () => {},
        error: () => {},
        warn: (_message: string, fields: unknown) => {
          warnings.push(fields);
        },
      },
    },
  };

  const connection = {
    send: (message: ControlMessage) => {
      messages.push(message);
    },
  } as Connection;

  return { context, connection, messages, warnings, running, processStat, starting: created.state };
};

it('refuses a stale runtime generation without replacing state or releasing the runtime', () => {
  const { context, connection, messages, warnings, running } = fixture();

  running.runtime.generation += 1;

  const before = context.state;

  handlePiReport(context, { type: 'piReport', paneId: target, token: pass, report }, connection);

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: false, reason: 'staleGeneration' } },
  ]);

  expect(warnings).toEqual([{ paneId: target, reason: 'staleGeneration' }]);
  expect(context.state).toBe(before);
  expect(context.runtime.panes.get(target)).toBe(running);
});

it('hides a record when a reused process id has a different start time', () => {
  const { context, connection, messages, processStat, running } = fixture();

  const recorded = applyPiReport(context.state, {
    paneId: target,
    generation: running.runtime.generation,
    process: { id: process.pid, startTime: processStat.startTime - 1 },
    report,
  });

  context.state = recorded.state;
  answerPiStatus(context, target, connection);

  expect(messages).toEqual([{ type: 'piStatusReply', paneId: target, pi: null }]);
});

it.each(['Z', 'X'])(
  'refuses an unreaped process in state %s and hides its earlier record',
  (state) => {
    const { context, connection, messages, warnings, running, processStat } = fixture();

    handlePiReport(context, { type: 'piReport', paneId: target, token: pass, report }, connection);

    const before = context.state;
    const line = `${process.pid} (pi) ${state} 1 ${processStat.group} ${processStat.session} 0 -1 0 0 0 0 0 0 0 0 0 0 0 0 0 ${processStat.startTime}`;
    const exited = parseStat(line);

    expect(exited).toMatchObject({
      state,
      session: processStat.session,
      startTime: processStat.startTime,
    });

    const statReader = spyOn(processGroups, 'readStat').mockReturnValue(exited);

    onTestFinished(() => {
      statReader.mockRestore();
    });

    handlePiReport(
      context,
      {
        type: 'piReport',
        paneId: target,
        token: pass,
        report: { ...report, sessionId: 'late-report' },
      },
      connection,
    );

    answerPiStatus(context, target, connection);

    expect(messages).toEqual([
      { type: 'piReportResult', result: { ok: true, status: 'recorded' } },
      { type: 'piReportResult', result: { ok: false, reason: 'processNotInPane' } },
      { type: 'piStatusReply', paneId: target, pi: null },
    ]);

    expect(context.state).toBe(before);
    expect(context.runtime.panes.get(target)).toBe(running);
    expect(context.state.panes[0]?.lifecycle).toBe('running');
    expect(warnings).toEqual([{ paneId: target, reason: 'processNotInPane' }]);
  },
);

it('records a live process and reports its identity without its process id or pass', () => {
  const { context, connection, messages } = fixture();

  handlePiReport(context, { type: 'piReport', paneId: target, token: pass, report }, connection);
  answerPiStatus(context, target, connection);

  const { processId: _processId, ...identity } = report;

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: true, status: 'recorded' } },
    { type: 'piStatusReply', paneId: target, pi: { state: 'reported', ...identity } },
  ]);
});

it('refuses a report whose pass does not match the pane pass', () => {
  const { context, connection, messages, warnings, running } = fixture();
  const before = context.state;

  handlePiReport(
    context,
    { type: 'piReport', paneId: target, token: 'b'.repeat(64), report },
    connection,
  );

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: false, reason: 'unauthorized' } },
  ]);

  expect(warnings).toEqual([{ paneId: target, reason: 'unauthorized' }]);
  expect(context.state).toBe(before);
  expect(context.runtime.panes.get(target)).toBe(running);
});

it('refuses a report for a pane that is not running yet', () => {
  const { context, connection, messages, running, starting } = fixture();

  context.state = starting;

  expect(starting.panes[0]?.lifecycle).toBe('starting');

  handlePiReport(context, { type: 'piReport', paneId: target, token: pass, report }, connection);

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: false, reason: 'unauthorized' } },
  ]);

  expect(context.state).toBe(starting);
  expect(context.runtime.panes.get(target)).toBe(running);
});

it('refuses a report for a pane without a runtime entry', () => {
  const { context, connection, messages } = fixture();
  const before = context.state;
  const panes = new Map<PaneId, RunningPane>();

  const unregistered = { ...context, runtime: { panes } };

  handlePiReport(
    unregistered,
    { type: 'piReport', paneId: target, token: pass, report },
    connection,
  );

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: false, reason: 'unauthorized' } },
  ]);

  expect(unregistered.state).toBe(before);
  expect(panes.size).toBe(0);
});

it('replies unknownPane to a status request for a pane the store does not know', () => {
  const { context, connection, messages } = fixture();

  answerPiStatus(context, paneId(9), connection);

  expect(messages).toEqual([{ type: 'paneFailed', reason: 'unknownPane', message: undefined }]);
});
