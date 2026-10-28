import { resolve } from 'node:path';

import type { PaneId } from '../ids.ts';
import type { MalformedPiRecord, PiRecovery, SavedPiRecord } from '../store/store.ts';
import type { PiSessionEntry, PiSessionFile } from './piSessionFile.ts';
import type { ProcessStat } from './processGroups.ts';

type PiRecoveryFailure = Extract<PiRecovery, { status: 'failed' }>['reason'];

type PiRecoveryBlock = Extract<PiRecovery, { status: 'blocked' }>['reason'];

type PiSessionRead = Extract<PiSessionFile, { status: 'read' }>;

type PiSessionEntries = PiSessionRead['entries'];

export interface PiRecoveryReads {
  readSessionFile: (sessionFile: string) => Promise<PiSessionFile>;
  readLiveProcess: (processId: number) => ProcessStat | undefined;
}

type RestoredPiRecord = SavedPiRecord | MalformedPiRecord;

const ready: PiRecovery = { status: 'ready' };

const failed = (reason: PiRecoveryFailure): PiRecovery => ({ status: 'failed', reason });

const blocked = (reason: PiRecoveryBlock): PiRecovery => ({ status: 'blocked', reason });

const isMalformed = (record: RestoredPiRecord): record is MalformedPiRecord => 'kind' in record;

const sessionKeysOf = (record: RestoredPiRecord): string[] => {
  const keys: string[] = [];

  if (record.sessionFile !== undefined) {
    keys.push(`file:${resolve(record.sessionFile)}`);
  }

  if (record.sessionId !== undefined) {
    keys.push(`id:${record.sessionId}`);
  }

  return keys;
};

const duplicatePanesOf = (records: ReadonlyMap<PaneId, RestoredPiRecord>): Set<PaneId> => {
  const panesByKey = new Map<string, PaneId[]>();

  for (const [paneId, record] of records) {
    for (const key of sessionKeysOf(record)) {
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

// Keys each entry by its id, as pi's index does, so a later entry replaces an earlier one. Entries
// without an id share the undefined key, which no parent link names.
const entriesById = (entries: PiSessionEntries): ReadonlyMap<string | undefined, PiSessionEntry> =>
  new Map(entries.map((entry) => [entry.id, entry] as const));

// Pi opens a file at its newest entry and rebuilds the history by following parent links, so a
// broken link silently shortens that history. The walk fails it.
const chainBroken = (
  newest: PiSessionEntry,
  byId: ReadonlyMap<string | undefined, PiSessionEntry>,
): boolean => {
  const visited = new Set<string>();
  let entry: PiSessionEntry | undefined = newest;

  while (entry !== undefined) {
    if (entry.id === undefined || visited.has(entry.id)) {
      return true;
    }

    visited.add(entry.id);

    if (entry.parent.kind !== 'entry') {
      return entry.parent.kind !== 'root';
    }

    entry = byId.get(entry.parent.id);
  }

  return true;
};

const branchMissing = (leafId: string | undefined, file: PiSessionRead): boolean => {
  const byId = entriesById(file.entries);
  const leafMissing = leafId !== undefined && !byId.has(leafId);
  const newest = file.entries.at(-1);
  const newestChainBroken = file.linked && newest !== undefined && chainBroken(newest, byId);

  return leafMissing || newestChainBroken;
};

const sessionFileRecoveryOf = (
  record: SavedPiRecord & { sessionId: string },
  file: PiSessionFile,
): PiRecovery => {
  if (file.status === 'failed') {
    const neverSaved = file.reason === 'missing' && !record.sessionFileSaved;

    return neverSaved ? ready : failed(sessionFileFailures[file.reason]);
  }

  if (file.sessionId !== record.sessionId) {
    return failed('sessionIdMismatch');
  }

  return branchMissing(record.leafId, file) ? failed('branchMissing') : ready;
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
