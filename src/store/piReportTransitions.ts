import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { Rejected, RejectReason, State } from './store.ts';

export interface PiProcess {
  id: number;
  startTime: number;
}

// The conversation a pi process reported. Absent optional values are undefined.
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
}

interface PiRecordBase {
  generation: number;
  process: PiProcess;
}

// A changed record drops the report, so it shows no conversation.
export type PiRecord =
  | (PiRecordBase & { state: 'reported'; report: PiReport })
  | (PiRecordBase & { state: 'changed' });

type PiReportStatus = 'recorded' | 'unchanged' | 'changed';

interface PiReportInput {
  paneId: PaneId;
  generation: number;
  process: PiProcess;
  report: PiReport;
}

interface PiReportApplied {
  kind: 'applied';
  state: State;
  status: PiReportStatus;
}

const reportFields: readonly (keyof PiReport)[] = [
  'processId',
  'piVersion',
  'sessionId',
  'sessionFile',
  'leafId',
  'provider',
  'model',
  'thinkingLevel',
  'ownership',
];

const sameReport = (left: PiReport, right: PiReport): boolean =>
  reportFields.every((field) => left[field] === right[field]);

const sameProcess = (left: PiProcess, right: PiProcess): boolean =>
  left.id === right.id && left.startTime === right.startTime;

const refuse = (state: State, reason: RejectReason): Rejected => ({
  kind: 'rejected',
  state,
  reason,
});

const applied = (state: State, status: PiReportStatus): PiReportApplied => ({
  kind: 'applied',
  state,
  status,
});

// Drops the records of panes the state no longer has.
const withRecord = (
  state: State,
  paneId: PaneId,
  record: PiRecord,
  status: PiReportStatus,
): PiReportApplied => {
  const livePaneIds = new Set(state.panes.map((pane) => pane.id));
  const kept = [...state.piReports].filter(([id]) => livePaneIds.has(id));
  const piReports = new Map<PaneId, PiRecord>([...kept, [paneId, record]]);

  return applied({ ...state, piReports }, status);
};

const reportRecord = (input: PiReportInput): PiRecord => ({
  state: 'reported',
  generation: input.generation,
  process: input.process,
  report: input.report,
});

const reportFromSameProcess = (
  state: State,
  current: PiRecord,
  input: PiReportInput,
): PiReportApplied => {
  if (current.state === 'changed') {
    return applied(state, 'changed');
  }

  if (sameReport(current.report, input.report)) {
    return applied(state, 'unchanged');
  }

  const changed: PiRecord = {
    state: 'changed',
    generation: current.generation,
    process: current.process,
  };

  return withRecord(state, input.paneId, changed, 'changed');
};

export const applyPiReport = (state: State, input: PiReportInput): PiReportApplied | Rejected => {
  const pane = state.panes.find((known) => known.id === input.paneId);

  if (pane === undefined) {
    return refuse(state, 'unknownPane');
  }

  if (pane.generation !== input.generation) {
    return refuse(state, 'staleGeneration');
  }

  invariant(input.report.processId === input.process.id, 'A pi report names its own process.');

  const current = state.piReports.get(input.paneId);
  const sameGeneration = current?.generation === input.generation;

  if (current !== undefined && sameGeneration && sameProcess(current.process, input.process)) {
    return reportFromSameProcess(state, current, input);
  }

  return withRecord(state, input.paneId, reportRecord(input), 'recorded');
};

// A record of another generation is not the pane's record, so it reads as no record.
export const piRecordOf = (state: State, paneId: PaneId): PiRecord | undefined => {
  const pane = state.panes.find((known) => known.id === paneId);
  const record = state.piReports.get(paneId);

  return pane !== undefined && record?.generation === pane.generation ? record : undefined;
};
