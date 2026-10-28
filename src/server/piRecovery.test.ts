import { expect, it } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import type { MalformedPiRecord, PiRecovery, SavedPiRecord } from '../store/store.ts';
import { checkPiRecoveries } from './piRecovery.ts';
import type { PiRecoveryReads } from './piRecovery.ts';
import { readLiveProcess } from './piReports.ts';
import { readPiSessionFile } from './piSessionFile.ts';
import { sessionDirectory, snapshotsAround, writePiSession } from './piSessionFixture.ts';

const recordWith = (changes: Partial<SavedPiRecord> = {}): SavedPiRecord => ({
  piVersion: '1.4.0',
  sessionId: 'session',
  sessionFile: '/sessions/session.jsonl',
  leafId: undefined,
  provider: 'koja-test',
  model: 'fake-model',
  thinkingLevel: 'low',
  ownership: 'interactive',
  process: { id: 4242, startTime: 100 },
  state: 'reported',
  sessionFileSaved: true,
  ...changes,
});

const target = paneId(1);
const other = paneId(2);

const noLiveProcess: PiRecoveryReads = {
  readSessionFile: readPiSessionFile,
  readLiveProcess: () => undefined,
};

const liveProcesses: PiRecoveryReads = { readSessionFile: readPiSessionFile, readLiveProcess };

const thisProcess = (): SavedPiRecord['process'] => {
  const stat = readLiveProcess(process.pid);

  invariant(stat !== undefined, 'The test process is live.');

  return { id: process.pid, startTime: stat.startTime };
};

const checkAllInDirectory = async (
  directory: string,
  records: ReadonlyMap<PaneId, SavedPiRecord | MalformedPiRecord>,
  reads = noLiveProcess,
): Promise<Map<PaneId, PiRecovery>> => {
  const { result, before, after } = await snapshotsAround(directory, () =>
    checkPiRecoveries(records, reads),
  );

  expect(after).toEqual(before);

  return result;
};

const checkInDirectory = async (
  directory: string,
  record: SavedPiRecord | MalformedPiRecord,
  reads = noLiveProcess,
): Promise<PiRecovery | undefined> =>
  (await checkAllInDirectory(directory, new Map([[target, record]]), reads)).get(target);

const savedRecordIn = (directory: string, changes: Partial<SavedPiRecord> = {}): SavedPiRecord => {
  const { sessionFile, sessionId, entryIds } = writePiSession(directory);

  return recordWith({ sessionFile, sessionId, leafId: entryIds.at(-1), ...changes });
};

const isAbsent = async (path: string): Promise<boolean> => !(await Bun.file(path).exists());

it('reopens a record whose session file holds its conversation', async () => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(directory, savedRecordIn(directory));

  expect(recovery).toEqual({ status: 'ready' });
});

it('reopens a record whose leaf is an older entry of its session', async () => {
  const directory = await sessionDirectory();
  const { sessionFile, sessionId, entryIds } = writePiSession(directory);
  const record = recordWith({ sessionFile, sessionId, leafId: entryIds[0] });

  const recovery = await checkInDirectory(directory, record);

  expect(recovery).toEqual({ status: 'ready' });
});

it('reopens a record without a leaf', async () => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(
    directory,
    savedRecordIn(directory, { leafId: undefined }),
  );

  expect(recovery).toEqual({ status: 'ready' });
});

it('reopens records that name different sessions', async () => {
  const directory = await sessionDirectory();

  const recoveries = await checkAllInDirectory(
    directory,
    new Map([
      [target, savedRecordIn(directory)],
      [other, savedRecordIn(directory)],
    ]),
  );

  expect(recoveries).toEqual(
    new Map([
      [target, { status: 'ready' }],
      [other, { status: 'ready' }],
    ]),
  );
});

it('reopens a record whose session file pi never saved', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'unsaved.jsonl');
  const record = recordWith({ sessionFile, sessionFileSaved: false });

  const recovery = await checkInDirectory(directory, record);

  expect(recovery).toEqual({ status: 'ready' });
  expect(await isAbsent(sessionFile)).toBe(true);
});

it('fails a malformed record', async () => {
  const directory = await sessionDirectory();
  const record: MalformedPiRecord = { kind: 'malformed', raw: { pi: 1 }, message: 'bad' };

  const recovery = await checkInDirectory(directory, record);

  expect(recovery).toEqual({ status: 'failed', reason: 'recordMalformed' });
});

it.each([
  ['a Tau worker', 'tauWorker', 'externalWorker'],
  ['an unknown owner', 'scheduler', 'ownershipUnknown'],
] as const)('blocks a record owned by %s', async (_name, ownership, reason) => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(directory, savedRecordIn(directory, { ownership }));

  expect(recovery).toEqual({ status: 'blocked', reason });
});

it('blocks a record saved while pi switched sessions', async () => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(
    directory,
    savedRecordIn(directory, { state: 'switching' }),
  );

  expect(recovery).toEqual({ status: 'blocked', reason: 'switchPending' });
});

it('blocks both records that name one session file', async () => {
  const directory = await sessionDirectory();
  const record = savedRecordIn(directory);
  const relativeFile = relative(process.cwd(), record.sessionFile ?? '');

  const recoveries = await checkAllInDirectory(
    directory,
    new Map([
      [target, record],
      [other, { ...record, sessionFile: relativeFile, sessionId: 'another' }],
    ]),
  );

  const duplicate: PiRecovery = { status: 'blocked', reason: 'duplicateSession' };

  expect(recoveries).toEqual(
    new Map([
      [target, duplicate],
      [other, duplicate],
    ]),
  );
});

it('blocks both records that name one session id', async () => {
  const directory = await sessionDirectory();
  const record = savedRecordIn(directory);
  const sameId = savedRecordIn(directory, { sessionId: record.sessionId });

  const recoveries = await checkAllInDirectory(
    directory,
    new Map([
      [target, record],
      [other, sameId],
    ]),
  );

  const duplicate: PiRecovery = { status: 'blocked', reason: 'duplicateSession' };

  expect(recoveries).toEqual(
    new Map([
      [target, duplicate],
      [other, duplicate],
    ]),
  );
});

it('blocks a record that shares its session with a Tau worker', async () => {
  const directory = await sessionDirectory();
  const record = savedRecordIn(directory);

  const recoveries = await checkAllInDirectory(
    directory,
    new Map([
      [target, record],
      [other, { ...record, ownership: 'tauWorker' }],
    ]),
  );

  expect(recoveries).toEqual(
    new Map([
      [target, { status: 'blocked', reason: 'duplicateSession' }],
      [other, { status: 'blocked', reason: 'externalWorker' }],
    ]),
  );
});

it('does not match records without a session file or id', async () => {
  const directory = await sessionDirectory();
  const unsaved = recordWith({ sessionFile: undefined, sessionId: undefined });

  const recoveries = await checkAllInDirectory(
    directory,
    new Map([
      [target, unsaved],
      [other, unsaved],
    ]),
  );

  const noSessionFile: PiRecovery = { status: 'failed', reason: 'noSessionFile' };

  expect(recoveries).toEqual(
    new Map([
      [target, noSessionFile],
      [other, noSessionFile],
    ]),
  );
});

it('blocks a record whose recorded pi still runs', async () => {
  const directory = await sessionDirectory();
  const record = savedRecordIn(directory, { process: thisProcess() });

  const recovery = await checkInDirectory(directory, record, liveProcesses);

  expect(recovery).toEqual({ status: 'blocked', reason: 'processSurvives' });
});

it('reopens a record whose process id now names another process', async () => {
  const directory = await sessionDirectory();
  const { id, startTime } = thisProcess();
  const record = savedRecordIn(directory, { process: { id, startTime: startTime + 1 } });

  const recovery = await checkInDirectory(directory, record, liveProcesses);

  expect(recovery).toEqual({ status: 'ready' });
});

it.each([
  ['session file', { sessionFile: undefined }],
  ['session id', { sessionId: undefined }],
])('fails a record without a %s', async (_name, changes) => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(directory, savedRecordIn(directory, changes));

  expect(recovery).toEqual({ status: 'failed', reason: 'noSessionFile' });
});

it.each([
  ['provider', { provider: undefined }],
  ['model', { model: undefined }],
  ['thinking level', { thinkingLevel: '' }],
])('fails a record without a %s', async (_name, changes) => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(directory, savedRecordIn(directory, changes));

  expect(recovery).toEqual({ status: 'failed', reason: 'modelMissing' });
});

it.each([
  ['session file', { sessionFile: '' }],
  ['session id', { sessionId: '' }],
])('fails a record whose %s is empty as having no session file', async (_name, changes) => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(directory, savedRecordIn(directory, changes));

  expect(recovery).toEqual({ status: 'failed', reason: 'noSessionFile' });
});

it.each([
  ['provider', { provider: '' }],
  ['model', { model: '' }],
])('fails a record whose %s is empty as naming no model', async (_name, changes) => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(directory, savedRecordIn(directory, changes));

  expect(recovery).toEqual({ status: 'failed', reason: 'modelMissing' });
});

it('fails a record whose saved session file is gone', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'gone.jsonl');

  const recovery = await checkInDirectory(directory, recordWith({ sessionFile }));

  expect(recovery).toEqual({ status: 'failed', reason: 'sessionFileMissing' });
  expect(await isAbsent(sessionFile)).toBe(true);
});

it('fails a record whose session file is empty', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'empty.jsonl');

  await writeFile(sessionFile, '');

  const recovery = await checkInDirectory(directory, recordWith({ sessionFile }));

  expect(recovery).toEqual({ status: 'failed', reason: 'sessionFileEmpty' });
  expect(await Bun.file(sessionFile).text()).toBe('');
});

it('fails an empty session file that pi never saved', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'empty.jsonl');

  await writeFile(sessionFile, '');

  const recovery = await checkInDirectory(
    directory,
    recordWith({ sessionFile, sessionFileSaved: false }),
  );

  expect(recovery).toEqual({ status: 'failed', reason: 'sessionFileEmpty' });
  expect(await Bun.file(sessionFile).text()).toBe('');
});

it('fails a record whose session file cannot be read', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'folder.jsonl');

  await mkdir(sessionFile);

  const recovery = await checkInDirectory(directory, recordWith({ sessionFile }));

  expect(recovery).toEqual({ status: 'failed', reason: 'sessionFileUnreadable' });
});

it('fails a record whose session file is a FIFO without waiting for a writer', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'pipe.jsonl');

  const mkfifo = Bun.spawn(['mkfifo', sessionFile]);

  expect(await mkfifo.exited).toBe(0);

  const recovery = await checkInDirectory(directory, recordWith({ sessionFile }));

  expect(recovery).toEqual({ status: 'failed', reason: 'sessionFileUnreadable' });
});

it('fails a record whose session file is not a pi session', async () => {
  const directory = await sessionDirectory();
  const sessionFile = join(directory, 'notes.jsonl');

  await writeFile(sessionFile, '{"type":"message","id":"a"}\n');

  const recovery = await checkInDirectory(directory, recordWith({ sessionFile }));

  expect(recovery).toEqual({ status: 'failed', reason: 'notPiSession' });
});

it('fails a record whose session file header names another session', async () => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(
    directory,
    savedRecordIn(directory, { sessionId: 'other' }),
  );

  expect(recovery).toEqual({ status: 'failed', reason: 'sessionIdMismatch' });
});

it('fails a record whose leaf is not in its session file', async () => {
  const directory = await sessionDirectory();

  const recovery = await checkInDirectory(directory, savedRecordIn(directory, { leafId: 'gone' }));

  expect(recovery).toEqual({ status: 'failed', reason: 'branchMissing' });
});
