import { expect, it, onTestFinished, spyOn } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

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
  event: { kind: 'start', reason: 'startup' },
  sequence: 1,
};

const { processId: _processId, event: _event, sequence: _sequence, ...identity } = report;

const quit = { event: { kind: 'shutdown', reason: 'quit' }, sequence: 2 } as const;

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

const goneProcessId = async (): Promise<number> => {
  const child = Bun.spawn(['/bin/true']);

  await child.exited;

  return child.pid;
};

const hideProcesses = (): void => {
  const statReader = spyOn(processGroups, 'readStat').mockReturnValue(undefined);

  onTestFinished(() => {
    statReader.mockRestore();
  });
};

const sessionDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-pi-reports-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
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

it('shows a record as lost with its last identity when a reused process id has a different start time', () => {
  const { context, connection, messages, processStat, running } = fixture();

  const recorded = applyPiReport(context.state, {
    paneId: target,
    generation: running.runtime.generation,
    process: { id: process.pid, startTime: processStat.startTime - 1 },
    report,
  });

  context.state = recorded.state;
  answerPiStatus(context, target, connection);

  expect(messages).toEqual([
    {
      type: 'piStatusReply',
      paneId: target,
      pi: { state: 'lost', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
    },
  ]);
});

it.each(['Z', 'X'])(
  'refuses a non-quit report from an unreaped process in state %s and shows its record as lost',
  (state) => {
    const { context, connection, messages, warnings, running, processStat, sendReport } = fixture();

    sendReport();

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

    sendReport({ event: { kind: 'tree' }, sequence: 2, sessionId: 'late-report' });
    answerPiStatus(context, target, connection);

    expect(messages).toEqual([
      { type: 'piReportResult', result: { ok: true, status: 'recorded' } },
      { type: 'piReportResult', result: { ok: false, reason: 'processNotInPane' } },
      {
        type: 'piStatusReply',
        paneId: target,
        pi: { state: 'lost', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
      },
    ]);

    expect(context.state).toBe(before);
    expect(context.runtime.panes.get(target)).toBe(running);
    expect(context.state.panes[0]?.lifecycle).toBe('running');
    expect(warnings).toEqual([{ paneId: target, reason: 'processNotInPane' }]);
  },
);

it('shows a gone process that sent no quit as lost with its last identity', () => {
  const { connection, context, messages, sendReport } = fixture();

  sendReport({ event: { kind: 'model' }, sequence: 2, model: 'opus' });
  sendReport({ event: { kind: 'start', reason: 'resume' }, sequence: 3, sessionId: 'session-b' });
  hideProcesses();
  answerPiStatus(context, target, connection);

  expect(messages.at(-1)).toEqual({
    type: 'piStatusReply',
    paneId: target,
    pi: {
      state: 'lost',
      ...identity,
      sessionId: 'session-b',
      ineligibleReasons: ['tauWorker', 'noSessionFile'],
    },
  });
});

it('clears the record on a quit report from its process after that process is gone', () => {
  const { connection, context, messages, running, sendReport } = fixture();

  sendReport();
  hideProcesses();
  sendReport(quit);
  answerPiStatus(context, target, connection);

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: true, status: 'recorded' } },
    { type: 'piReportResult', result: { ok: true, status: 'updated' } },
    { type: 'piStatusReply', paneId: target, pi: null },
  ]);

  expect(context.runtime.panes.get(target)).toBe(running);
  expect(context.state.panes[0]?.lifecycle).toBe('running');
});

it('refuses a quit report from a gone process whose id is not the recorded process', async () => {
  const { connection, context, messages, running, sendReport, warnings } = fixture();

  sendReport();

  const before = context.state;

  sendReport({ ...quit, processId: await goneProcessId() });
  answerPiStatus(context, target, connection);

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: true, status: 'recorded' } },
    { type: 'piReportResult', result: { ok: false, reason: 'processNotInPane' } },
    {
      type: 'piStatusReply',
      paneId: target,
      pi: { state: 'reported', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
    },
  ]);

  expect(warnings).toEqual([{ paneId: target, reason: 'processNotInPane' }]);
  expect(context.state).toBe(before);
  expect(context.runtime.panes.get(target)).toBe(running);
  expect(context.state.panes[0]?.lifecycle).toBe('running');
});

it('refuses a quit report from a gone process when the pane has no record', async () => {
  const { connection, context, messages, running, sendReport } = fixture();
  const before = context.state;

  sendReport({ ...quit, processId: await goneProcessId() });
  answerPiStatus(context, target, connection);

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: false, reason: 'processNotInPane' } },
    { type: 'piStatusReply', paneId: target, pi: null },
  ]);

  expect(context.state).toBe(before);
  expect(context.runtime.panes.get(target)).toBe(running);
});

it('refuses a non-start report from a live process the pane has not recorded', () => {
  const { connection, context, messages, running, sendReport, warnings } = fixture();
  const before = context.state;

  sendReport({ event: { kind: 'model' } });
  answerPiStatus(context, target, connection);

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: false, reason: 'processNotRecorded' } },
    { type: 'piStatusReply', paneId: target, pi: null },
  ]);

  expect(warnings).toEqual([{ paneId: target, reason: 'processNotRecorded' }]);
  expect(context.state).toBe(before);
  expect(context.runtime.panes.get(target)).toBe(running);
});

it('shows a pending switch as switching with no identity', () => {
  const { connection, context, messages, sendReport } = fixture();

  sendReport({ ownership: 'interactive' });
  sendReport({ ownership: 'interactive', event: { kind: 'shutdown', reason: 'new' }, sequence: 2 });
  answerPiStatus(context, target, connection);

  expect(messages.at(-1)).toEqual({
    type: 'piStatusReply',
    paneId: target,
    pi: { state: 'switching', ineligibleReasons: ['switchPending'] },
  });
});

it('shows a lost record that was switching with its last identity and the pending switch', () => {
  const { connection, context, messages, sendReport } = fixture();

  sendReport({ ownership: 'interactive' });

  sendReport({
    ownership: 'interactive',
    event: { kind: 'shutdown', reason: 'fork' },
    sequence: 2,
  });

  hideProcesses();
  answerPiStatus(context, target, connection);

  expect(messages.at(-1)).toEqual({
    type: 'piStatusReply',
    paneId: target,
    pi: {
      state: 'lost',
      ...identity,
      ownership: 'interactive',
      ineligibleReasons: ['switchPending'],
    },
  });
});

it('ignores a report from the recorded process with an older sequence', () => {
  const { connection, context, messages, sendReport } = fixture();

  sendReport({ sequence: 5 });

  const before = context.state;

  sendReport({ event: { kind: 'tree' }, sequence: 4, leafId: 'old-leaf' });
  answerPiStatus(context, target, connection);

  expect(messages.slice(1)).toEqual([
    { type: 'piReportResult', result: { ok: true, status: 'ignored' } },
    {
      type: 'piStatusReply',
      paneId: target,
      pi: { state: 'reported', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
    },
  ]);

  expect(context.state).toBe(before);
});

it.each([
  ['a Tau worker', { ownership: 'tauWorker' }, 'saved', ['tauWorker']],
  ['a pi without a session file', { ownership: 'interactive' }, undefined, ['noSessionFile']],
  ['a session file not on disk', { ownership: 'interactive' }, 'missing', ['sessionNotSaved']],
  ['a session path that is a folder', { ownership: 'interactive' }, 'folder', ['sessionNotSaved']],
  ['a relative session path', { ownership: 'interactive' }, 'relative', ['sessionNotSaved']],
  ['a saved interactive session', { ownership: 'interactive' }, 'saved', []],
] as const)(
  'gives the recovery reasons of %s',
  async (_name, changes, sessionFileKind, ineligibleReasons) => {
    const directory = await sessionDirectory();
    const saved = join(directory, 'saved.jsonl');
    const folder = join(directory, 'folder.jsonl');

    await writeFile(saved, '{}\n');
    await mkdir(folder);

    const sessionFiles = {
      saved,
      folder,
      missing: join(directory, 'missing.jsonl'),
      relative: relative(process.cwd(), saved),
    };

    const sessionFile = sessionFileKind === undefined ? undefined : sessionFiles[sessionFileKind];
    const { connection, context, messages, sendReport } = fixture();

    sendReport({ ...changes, sessionFile });
    answerPiStatus(context, target, connection);

    expect(messages.at(-1)).toEqual({
      type: 'piStatusReply',
      paneId: target,
      pi: {
        state: 'reported',
        ...identity,
        ...changes,
        sessionFile,
        ineligibleReasons: [...ineligibleReasons],
      },
    });
  },
);

it('records a live process and reports its identity without its process id or pass', () => {
  const { context, connection, messages, sendReport } = fixture();

  sendReport();
  answerPiStatus(context, target, connection);

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: true, status: 'recorded' } },
    {
      type: 'piStatusReply',
      paneId: target,
      pi: { state: 'reported', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
    },
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

it('shows the record of a pane without a runtime entry as lost', () => {
  const { context, connection, messages, sendReport } = fixture();

  sendReport();

  const unregistered = { ...context, runtime: { panes: new Map<PaneId, RunningPane>() } };

  answerPiStatus(unregistered, target, connection);

  expect(messages.at(-1)).toEqual({
    type: 'piStatusReply',
    paneId: target,
    pi: { state: 'lost', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
  });
});

it('shows a record as lost when its process has left the pane shell session', () => {
  const { context, connection, messages, running, sendReport } = fixture();

  sendReport();
  running.runtime.processId += 1;
  answerPiStatus(context, target, connection);

  expect(messages.at(-1)).toEqual({
    type: 'piStatusReply',
    paneId: target,
    pi: { state: 'lost', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
  });
});

it('replies unknownPane to a status request for a pane the store does not know', () => {
  const { context, connection, messages } = fixture();

  answerPiStatus(context, paneId(9), connection);

  expect(messages).toEqual([{ type: 'paneFailed', reason: 'unknownPane', message: undefined }]);
});
