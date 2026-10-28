import { resolve } from 'node:path';

import type { PaneId } from '../ids.ts';
import type { MalformedPiRecord, PiRecovery, SavedPiRecord } from '../store/store.ts';
import type { PiSessionFile } from './piSessionFile.ts';
import type { ProcessStat } from './processGroups.ts';

type PiRecoveryFailure = Extract<PiRecovery, { status: 'failed' }>['reason'];

type PiRecoveryBlock = Extract<PiRecovery, { status: 'blocked' }>['reason'];

export interface PiRecoveryReads {
  readSessionFile: (sessionFile: string) => Promise<PiSessionFile>;
  readLiveProcess: (processId: number) => ProcessStat | undefined;
}

type RestoredPiRecord = SavedPiRecord | MalformedPiRecord;

const ready: PiRecovery = { status: 'ready' };

const failed = (reason: PiRecoveryFailure): PiRecovery => ({ status: 'failed', reason });

const blocked = (reason: PiRecoveryBlock): PiRecovery => ({ status: 'blocked', reason });

const isMalformed = (record: RestoredPiRecord): record is MalformedPiRecord => 'kind' in record;

const sessionKeysOf = (record: SavedPiRecord): string[] => {
  const keys: string[] = [];

  if (record.sessionFile !== undefined) {
    keys.push(`file:${resolve(record.sessionFile)}`);
  }

  if (record.sessionId !== undefined) {
    keys.push(`id:${record.sessionId}`);
  }

  return keys;
};

// Every record that shares a session file or session id with another record, whatever else
// blocks either of them.
const duplicatePanesOf = (records: ReadonlyMap<PaneId, RestoredPiRecord>): Set<PaneId> => {
  const panesByKey = new Map<string, PaneId[]>();

  for (const [paneId, record] of records) {
    const keys = isMalformed(record) ? [] : sessionKeysOf(record);

    for (const key of keys) {
      panesByKey.set(key, [...(panesByKey.get(key) ?? []), paneId]);
    }
  }

  const groups = [...panesByKey.values()].filter((panes) => panes.length > 1);

  return new Set(groups.flat());
};

const ownershipBlockOf = (ownership: string): PiRecoveryBlock | undefined => {
  if (ownership === 'tauWorker') {
    return 'externalWorker';
  }

  return ownership === 'interactive' ? undefined : 'ownershipUnknown';
};

const processSurvives = (record: SavedPiRecord, reads: PiRecoveryReads): boolean =>
  reads.readLiveProcess(record.process.id)?.startTime === record.process.startTime;

const recordBlockOf = (
  record: SavedPiRecord,
  duplicate: boolean,
  reads: PiRecoveryReads,
): PiRecoveryBlock | undefined => {
  const ownershipBlock = ownershipBlockOf(record.ownership);

  if (ownershipBlock !== undefined) {
    return ownershipBlock;
  }

  if (record.state === 'switching') {
    return 'switchPending';
  }

  if (duplicate) {
    return 'duplicateSession';
  }

  return processSurvives(record, reads) ? 'processSurvives' : undefined;
};

const hasText = (value: string | undefined): value is string => value !== undefined && value !== '';

const modelMissing = (record: SavedPiRecord): boolean =>
  !hasText(record.provider) || !hasText(record.model) || record.thinkingLevel === '';

const sessionFileFailures = {
  missing: 'sessionFileMissing',
  empty: 'sessionFileEmpty',
  unreadable: 'sessionFileUnreadable',
  notPiSession: 'notPiSession',
} as const;

const branchMissing = (leafId: string | undefined, entryIds: ReadonlySet<string>): boolean =>
  leafId !== undefined && !entryIds.has(leafId);

const sessionFileRecoveryOf = (
  record: SavedPiRecord & { sessionId: string },
  file: PiSessionFile,
): PiRecovery => {
  if (file.status === 'failed') {
    // Pi starts on the same path, so a file it never saved holds no conversation to lose.
    const neverSaved = file.reason === 'missing' && !record.sessionFileSaved;

    return neverSaved ? ready : failed(sessionFileFailures[file.reason]);
  }

  if (file.sessionId !== record.sessionId) {
    return failed('sessionIdMismatch');
  }

  return branchMissing(record.leafId, file.entryIds) ? failed('branchMissing') : ready;
};

const recoveryOf = async (
  record: RestoredPiRecord,
  duplicate: boolean,
  reads: PiRecoveryReads,
): Promise<PiRecovery> => {
  if (isMalformed(record)) {
    return failed('recordMalformed');
  }

  const block = recordBlockOf(record, duplicate, reads);

  if (block !== undefined) {
    return blocked(block);
  }

  const { sessionFile, sessionId } = record;

  if (!hasText(sessionFile) || !hasText(sessionId)) {
    return failed('noSessionFile');
  }

  if (modelMissing(record)) {
    return failed('modelMissing');
  }

  const file = await reads.readSessionFile(sessionFile);

  return sessionFileRecoveryOf({ ...record, sessionId }, file);
};

// Decides whether each restored pi conversation can reopen. It only reads session files and
// process stats, so it never changes a conversation pi saved.
export const checkPiRecoveries = async (
  records: ReadonlyMap<PaneId, RestoredPiRecord>,
  reads: PiRecoveryReads,
): Promise<Map<PaneId, PiRecovery>> => {
  const duplicates = duplicatePanesOf(records);

  const checks = [...records].map(
    async ([paneId, record]) =>
      [paneId, await recoveryOf(record, duplicates.has(paneId), reads)] as const,
  );

  return new Map(await Promise.all(checks));
};

export const piRecoveryReasonText: Record<PiRecoveryFailure | PiRecoveryBlock, string> = {
  recordMalformed: 'the saved pi record is malformed',
  noSessionFile: 'pi reported no session file',
  modelMissing: 'the saved pi record names no model',
  sessionFileMissing: 'the session file is missing',
  sessionFileEmpty: 'the session file is empty',
  sessionFileUnreadable: 'the session file cannot be read',
  notPiSession: 'the file is not a pi session',
  sessionIdMismatch: 'the file holds another conversation',
  branchMissing: 'the file lacks the saved branch',
  externalWorker: 'a Tau worker owns this pi',
  ownershipUnknown: 'the saved pi record names an unknown owner',
  switchPending: 'the conversation was switching',
  duplicateSession: 'another pane names this session file',
  processSurvives: 'the saved pi process still runs',
};

export const piRecoveryMessage = (
  recovery: Exclude<PiRecovery, { status: 'ready' }>,
  sessionFile: string | undefined,
): string => {
  const conversation =
    sessionFile === undefined ? 'Saved pi conversation' : `Saved pi conversation ${sessionFile}`;

  const verdict = recovery.status === 'failed' ? 'cannot reopen' : 'is blocked';
  const reason = piRecoveryReasonText[recovery.reason];

  return `${conversation} ${verdict}: ${reason}. Resolve it and restart the Koja server.`;
};
