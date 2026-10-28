import { timingSafeEqual } from 'node:crypto';
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import type { PaneId } from '../ids.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { applyGonePiQuit, applyPiReport, piRecordOf, piRecoveryOf } from '../store/store.ts';
import type { PiRecord, State } from '../store/store.ts';
import type { Connection } from './connection.ts';
import type { Log } from './log.ts';
import type { RunningPane } from './paneRecord.ts';
import { readStat } from './processGroups.ts';
import type { ProcessStat } from './processGroups.ts';

interface PiContext {
  state: State;
  runtime: { panes: ReadonlyMap<PaneId, RunningPane> };
  options: { log: Log };
}

type PiReportRequest = Extract<ControlMessage, { type: 'piReport' }>;
type PiReportResult = Extract<ControlMessage, { type: 'piReportResult' }>['result'];
type PiStatus = Extract<ControlMessage, { type: 'piStatusReply' }>['pi'];
type PiIneligibleReason = NonNullable<PiStatus>['ineligibleReasons'][number];

export const readLiveProcess = (processId: number): ProcessStat | undefined => {
  const stat = readStat(String(processId));

  if (stat === undefined || stat.state === 'Z' || stat.state === 'X') {
    return undefined;
  }

  return stat;
};

const applyReport = (
  state: State,
  running: RunningPane,
  message: PiReportRequest,
): ReturnType<typeof applyPiReport> => {
  const { paneId, report } = message;
  const { generation } = running.runtime;
  const processStat = readLiveProcess(report.processId);

  if (processStat?.session !== running.runtime.processId) {
    return applyGonePiQuit(state, { paneId, generation, report });
  }

  const process = { id: report.processId, startTime: processStat.startTime };

  return applyPiReport(state, { paneId, generation, process, report });
};

const recordReport = (context: PiContext, message: PiReportRequest): PiReportResult => {
  const running = context.runtime.panes.get(message.paneId);
  const pane = context.state.panes.find((known) => known.id === message.paneId);

  if (running === undefined || pane?.lifecycle !== 'running') {
    return { ok: false, reason: 'unauthorized' };
  }

  const matches = timingSafeEqual(Buffer.from(running.reportPass), Buffer.from(message.token));

  if (!matches) {
    return { ok: false, reason: 'unauthorized' };
  }

  const result = applyReport(context.state, running, message);

  if (result.kind === 'rejected') {
    return { ok: false, reason: result.reason };
  }

  context.state = result.state;

  return { ok: true, status: result.status };
};

// Returns whether the report changed the pane's record, so the caller saves the session.
export const handlePiReport = (
  context: PiContext,
  message: PiReportRequest,
  connection: Connection,
): boolean => {
  const result = recordReport(context, message);

  if (!result.ok) {
    context.options.log.warn('Refused a pi report.', {
      paneId: message.paneId,
      reason: result.reason,
    });
  }

  connection.send({ type: 'piReportResult', result });

  return result.ok && result.status !== 'ignored';
};

export const isSavedSessionFile = (path: string): boolean => {
  if (!isAbsolute(path)) {
    return false;
  }

  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const ineligibleReasonsOf = (record: PiRecord): PiIneligibleReason[] => {
  const reasons: PiIneligibleReason[] = [];
  const { ownership, sessionFile } = record.report;

  if (ownership === 'tauWorker') {
    reasons.push('tauWorker');
  }

  if (record.state === 'switching') {
    reasons.push('switchPending');
  } else if (sessionFile === undefined) {
    reasons.push('noSessionFile');
  } else if (!isSavedSessionFile(sessionFile)) {
    reasons.push('sessionNotSaved');
  }

  return reasons;
};

const runsInPane = (record: PiRecord, running: RunningPane | undefined): boolean => {
  if (running === undefined) {
    return false;
  }

  const processStat = readLiveProcess(record.process.id);

  if (processStat?.startTime !== record.process.startTime) {
    return false;
  }

  return processStat.session === running.runtime.processId;
};

const piStatusOf = (context: PiContext, paneId: PaneId): PiStatus => {
  const record = piRecordOf(context.state, paneId);

  if (record === undefined || record.state === 'exited') {
    return null;
  }

  const ineligibleReasons = ineligibleReasonsOf(record);
  const live = runsInPane(record, context.runtime.panes.get(paneId));

  if (live && record.state === 'switching') {
    return { state: 'switching', ineligibleReasons };
  }

  const { processId: _processId, event: _event, sequence: _sequence, ...identity } = record.report;

  return { state: live ? 'reported' : 'lost', ...identity, ineligibleReasons };
};

export const answerPiStatus = (
  context: PiContext,
  paneId: PaneId,
  connection: Connection,
): void => {
  if (!context.state.panes.some((pane) => pane.id === paneId)) {
    connection.send({ type: 'paneFailed', reason: 'unknownPane', message: undefined });

    return;
  }

  connection.send({
    type: 'piStatusReply',
    paneId,
    pi: piStatusOf(context, paneId),
    recovery: piRecoveryOf(context.state, paneId) ?? null,
  });
};
