import { timingSafeEqual } from 'node:crypto';

import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { applyPiReport, piRecordOf } from '../store/store.ts';
import type { State } from '../store/store.ts';
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

const readLiveProcess = (processId: number): ProcessStat | undefined => {
  const stat = readStat(String(processId));

  if (stat === undefined || stat.state === 'Z' || stat.state === 'X') {
    return undefined;
  }

  return stat;
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

  const processStat = readLiveProcess(message.report.processId);

  if (processStat?.session !== running.runtime.processId) {
    return { ok: false, reason: 'processNotInPane' };
  }

  const result = applyPiReport(context.state, {
    paneId: message.paneId,
    generation: running.runtime.generation,
    process: { id: message.report.processId, startTime: processStat.startTime },
    report: message.report,
  });

  if (result.kind === 'rejected') {
    invariant(
      result.reason === 'unknownPane' || result.reason === 'staleGeneration',
      'Unexpected pi report refusal.',
    );

    return { ok: false, reason: result.reason };
  }

  context.state = result.state;

  return { ok: true, status: result.status };
};

export const handlePiReport = (
  context: PiContext,
  message: PiReportRequest,
  connection: Connection,
): void => {
  const result = recordReport(context, message);

  if (!result.ok) {
    context.options.log.warn('Refused a pi report.', {
      paneId: message.paneId,
      reason: result.reason,
    });
  }

  connection.send({ type: 'piReportResult', result });
};

const livePiStatus = (context: PiContext, paneId: PaneId): PiStatus => {
  const record = piRecordOf(context.state, paneId);
  const running = context.runtime.panes.get(paneId);

  if (record === undefined || running === undefined) {
    return null;
  }

  const processStat = readLiveProcess(record.process.id);

  if (processStat?.startTime !== record.process.startTime) {
    return null;
  }

  if (processStat.session !== running.runtime.processId) {
    return null;
  }

  if (record.state === 'changed') {
    return { state: 'changed' };
  }

  const { processId: _processId, ...report } = record.report;

  return { state: 'reported', ...report };
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

  connection.send({ type: 'piStatusReply', paneId, pi: livePiStatus(context, paneId) });
};
