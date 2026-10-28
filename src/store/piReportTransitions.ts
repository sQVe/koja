import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { withoutPiRecords } from './piRecoveryRecords.ts';
import type { State } from './store.ts';

export interface PiProcess {
  id: number;
  startTime: number;
}

type PiSwitchReason = 'reload' | 'new' | 'resume' | 'fork';

export type PiEvent =
  | { kind: 'start'; reason: 'startup' | PiSwitchReason }
  | { kind: 'tree' }
  | { kind: 'model' }
  | { kind: 'thinking' }
  | { kind: 'shutdown'; reason: 'quit' | PiSwitchReason };

export interface PiReport {
  processId: number;
  piVersion: string;
  sessionId: string | undefined;
  sessionFile: string | undefined;
  leafId: string | undefined;
  provider: string | undefined;
  model: string | undefined;
  thinkingLevel: string;
  ownership: 'interactive' | 'tauWorker';
  event: PiEvent;
  sequence: number;
}

export interface PiRecord {
  state: 'reported' | 'switching' | 'exited';
  generation: number;
  process: PiProcess;
  sequence: number;
  report: PiReport;
}

type PiReportStatus = 'recorded' | 'updated' | 'ignored';

type PiReportRefusal =
  | 'unknownPane'
  | 'staleGeneration'
  | 'processNotRecorded'
  | 'processNotInPane';

interface PiReportInput {
  paneId: PaneId;
  generation: number;
  process: PiProcess;
  report: PiReport;
}

interface GonePiQuitInput {
  paneId: PaneId;
  generation: number;
  report: PiReport;
}

interface PiReportApplied {
  kind: 'applied';
  state: State;
  status: PiReportStatus;
}

interface PiReportRejected {
  kind: 'rejected';
  state: State;
  reason: PiReportRefusal;
}

type PiReportResult = PiReportApplied | PiReportRejected;

const sameProcess = (left: PiProcess, right: PiProcess): boolean =>
  left.id === right.id && left.startTime === right.startTime;

const isQuit = (event: PiEvent): boolean => event.kind === 'shutdown' && event.reason === 'quit';

const refuse = (state: State, reason: PiReportRefusal): PiReportRejected => ({
  kind: 'rejected',
  state,
  reason,
});

const applied = (state: State, status: PiReportStatus): PiReportApplied => ({
  kind: 'applied',
  state,
  status,
});

const withRecord = (
  state: State,
  paneId: PaneId,
  record: PiRecord,
  status: PiReportStatus,
): PiReportApplied => {
  const piReports = new Map<PaneId, PiRecord>([...state.piReports, [paneId, record]]);

  return applied({ ...withoutPiRecords(state, [paneId]), piReports }, status);
};

const nextRecordState = (current: PiRecord['state'], event: PiEvent): PiRecord['state'] => {
  if (event.kind === 'start') {
    return 'reported';
  }

  if (event.kind === 'shutdown') {
    return event.reason === 'quit' ? 'exited' : 'switching';
  }

  return current;
};

const reportFromRecordedProcess = (
  state: State,
  current: PiRecord,
  input: PiReportInput,
): PiReportApplied => {
  if (input.report.sequence <= current.sequence) {
    return applied(state, 'ignored');
  }

  const record: PiRecord = {
    ...current,
    state: nextRecordState(current.state, input.report.event),
    sequence: input.report.sequence,
    report: input.report,
  };

  return withRecord(state, input.paneId, record, 'updated');
};

const generationRefusal = (
  state: State,
  paneId: PaneId,
  generation: number,
): PiReportRefusal | undefined => {
  const pane = state.panes.find((known) => known.id === paneId);

  if (pane === undefined) {
    return 'unknownPane';
  }

  return pane.generation === generation ? undefined : 'staleGeneration';
};

export const piRecordOf = (state: State, paneId: PaneId): PiRecord | undefined => {
  const pane = state.panes.find((known) => known.id === paneId);
  const record = state.piReports.get(paneId);

  return pane !== undefined && record?.generation === pane.generation ? record : undefined;
};

export const applyPiReport = (state: State, input: PiReportInput): PiReportResult => {
  const refusal = generationRefusal(state, input.paneId, input.generation);

  if (refusal !== undefined) {
    return refuse(state, refusal);
  }

  invariant(input.report.processId === input.process.id, 'A pi report names its own process.');

  const current = piRecordOf(state, input.paneId);

  if (current !== undefined && sameProcess(current.process, input.process)) {
    return reportFromRecordedProcess(state, current, input);
  }

  if (input.report.event.kind !== 'start') {
    return refuse(state, 'processNotRecorded');
  }

  const record: PiRecord = {
    state: 'reported',
    generation: input.generation,
    process: input.process,
    sequence: input.report.sequence,
    report: input.report,
  };

  return withRecord(state, input.paneId, record, 'recorded');
};

export const applyGonePiQuit = (state: State, input: GonePiQuitInput): PiReportResult => {
  const refusal = generationRefusal(state, input.paneId, input.generation);

  if (refusal !== undefined) {
    return refuse(state, refusal);
  }

  const current = piRecordOf(state, input.paneId);

  if (!isQuit(input.report.event) || current?.process.id !== input.report.processId) {
    return refuse(state, 'processNotInPane');
  }

  if (input.report.sequence <= current.sequence) {
    return applied(state, 'ignored');
  }

  const record: PiRecord = { ...current, state: 'exited', sequence: input.report.sequence };

  return withRecord(state, input.paneId, record, 'updated');
};
