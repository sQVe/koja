import type { PaneId } from '../ids.ts';
import type { PiProcess, PiRecord } from './piReportTransitions.ts';
import type { State } from './store.ts';

// What a restore needs to reopen a pane's pi conversation. The ownership stays a string, so a
// value this version does not know survives to the recovery check.
export interface SavedPiRecord {
  piVersion: string;
  sessionId: string | undefined;
  sessionFile: string | undefined;
  leafId: string | undefined;
  provider: string | undefined;
  model: string | undefined;
  thinkingLevel: string;
  ownership: string;
  process: PiProcess;
  state: 'reported' | 'switching';
  sessionFileSaved: boolean;
}

// A saved pi value that did not parse. The writer saves raw back, so a later version can still
// read it.
export interface MalformedPiRecord {
  kind: 'malformed';
  raw: unknown;
  message: string;
}

export type SavedPi = SavedPiRecord | MalformedPiRecord | undefined;

type PiRecoveryFailure =
  | 'recordMalformed'
  | 'noSessionFile'
  | 'modelMissing'
  | 'sessionFileMissing'
  | 'sessionFileEmpty'
  | 'sessionFileUnreadable'
  | 'notPiSession'
  | 'sessionIdMismatch'
  | 'branchMissing';

type PiRecoveryBlock =
  | 'externalWorker'
  | 'ownershipUnknown'
  | 'switchPending'
  | 'duplicateSession'
  | 'processSurvives';

export type PiRecovery =
  | { status: 'ready' }
  | { status: 'failed'; reason: PiRecoveryFailure }
  | { status: 'blocked'; reason: PiRecoveryBlock };

export interface RestoredPi {
  generation: number;
  pi: SavedPiRecord | MalformedPiRecord;
  // Absent until the restore checks the record.
  recovery: PiRecovery | undefined;
}

type OpenPiRecord = PiRecord & { state: SavedPiRecord['state'] };

const savedRecordOf = (
  record: OpenPiRecord,
  savedSessionFiles: ReadonlySet<string>,
): SavedPiRecord => {
  const { piVersion, sessionId, sessionFile, leafId, provider, model, thinkingLevel, ownership } =
    record.report;

  return {
    piVersion,
    sessionId,
    sessionFile,
    leafId,
    provider,
    model,
    thinkingLevel,
    ownership,
    process: { id: record.process.id, startTime: record.process.startTime },
    state: record.state,
    sessionFileSaved: sessionFile !== undefined && savedSessionFiles.has(sessionFile),
  };
};

const isOpen = (record: PiRecord | undefined): record is OpenPiRecord =>
  record !== undefined && record.state !== 'exited';

// A pane's live record wins. Without one, the pane keeps the record it was restored with, so a
// pane that failed to start or has not reopened pi yet does not lose it.
export const savedPiOf = (
  live: PiRecord | undefined,
  restored: RestoredPi | undefined,
  savedSessionFiles: ReadonlySet<string>,
): SavedPi => (isOpen(live) ? savedRecordOf(live, savedSessionFiles) : restored?.pi);

export const withoutRestoredPi = (state: State, removed: readonly PaneId[]): State => {
  const restoredPi = new Map(state.restoredPi);

  for (const id of removed) {
    restoredPi.delete(id);
  }

  return { ...state, restoredPi };
};

// The fact names a current pane generation. A pane restored without a record keeps none.
export const recordPiRecovery = (state: State, paneId: PaneId, recovery: PiRecovery): State => {
  const restored = state.restoredPi.get(paneId);

  if (restored === undefined) {
    return state;
  }

  const restoredPi = new Map([...state.restoredPi, [paneId, { ...restored, recovery }]]);

  return { ...state, restoredPi };
};

export const piRecoveryOf = (state: State, paneId: PaneId): PiRecovery | undefined =>
  state.restoredPi.get(paneId)?.recovery;
