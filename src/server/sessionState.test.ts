import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { paneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { applyIntent, applyPiReport, createState, savedSessionOf } from '../store/store.ts';
import type { PiReport, SavedPi, SavedPiRecord, SavedSession, State } from '../store/store.ts';
import { checkPiRecoveries } from './piRecovery.ts';
import { readPiSessionFile } from './piSessionFile.ts';
import { currentSession, savedSessionFilesOf } from './sessionState.ts';

const report: PiReport = {
  processId: 100,
  piVersion: '1.4.0',
  sessionId: 'session-a',
  sessionFile: '/sessions/a.jsonl',
  leafId: 'leaf-1',
  provider: 'anthropic',
  model: 'sonnet',
  thinkingLevel: 'off',
  ownership: 'interactive',
  event: { kind: 'start', reason: 'startup' },
  sequence: 1,
};

const contextOf = (state: State) => ({
  state,
  runtime: { panes: new Map(), seenSessionFiles: new Set<string>() },
});

const noLiveProcess = () => undefined;

it('saves the pane pi record after a pi report, and whether its session file exists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-state-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const sessionFile = join(directory, 'a.jsonl');

  const started = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/work/koja',
    label: 'koja',
    focus: true,
  }).state;

  const pane = started.panes[0];
  invariant(pane !== undefined, 'Expected the workspace to start a pane.');

  const reported = applyPiReport(started, {
    paneId: paneId(1),
    generation: pane.generation,
    process: { id: report.processId, startTime: 5000 },
    report: { ...report, sessionFile },
  });

  const savedPi = () => currentSession(contextOf(reported.state)).panes[0]?.pi;

  expect(currentSession(contextOf(started)).panes[0]?.pi).toBeUndefined();
  expect(savedPi()).toMatchObject({ sessionFile, sessionFileSaved: false });

  await writeFile(sessionFile, '');

  expect(savedPi()).toStrictEqual({
    piVersion: '1.4.0',
    sessionId: 'session-a',
    sessionFile,
    leafId: 'leaf-1',
    provider: 'anthropic',
    model: 'sonnet',
    thinkingLevel: 'off',
    ownership: 'interactive',
    process: { id: report.processId, startTime: 5000 },
    state: 'reported',
    sessionFileSaved: true,
  });
});

it('keeps a session file saved after it is deleted while its pi still runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-state-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const sessionFile = join(directory, 'a.jsonl');

  const started = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/work/koja',
    label: 'koja',
    focus: true,
  }).state;

  const pane = started.panes[0];
  invariant(pane !== undefined, 'Expected the workspace to start a pane.');

  const reported = applyPiReport(started, {
    paneId: paneId(1),
    generation: pane.generation,
    process: { id: report.processId, startTime: 5000 },
    report: { ...report, sessionFile },
  });

  const context = contextOf(reported.state);

  await writeFile(sessionFile, '');

  expect(currentSession(context).panes[0]?.pi).toMatchObject({ sessionFileSaved: true });

  await rm(sessionFile);

  const savedPi = currentSession(context).panes[0]?.pi;

  expect(savedPi).toMatchObject({ sessionFile, sessionFileSaved: true });

  invariant(savedPi !== undefined, 'The pane keeps its pi record.');

  const recoveries = await checkPiRecoveries(new Map([[paneId(1), savedPi]]), {
    readSessionFile: readPiSessionFile,
    readLiveProcess: noLiveProcess,
  });

  expect(recoveries).toEqual(
    new Map([[paneId(1), { status: 'failed', reason: 'sessionFileMissing' }]]),
  );
});

it('forgets a session file once no live or restored record names it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-state-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const sessionFile = join(directory, 'a.jsonl');

  const started = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/work/koja',
    label: 'koja',
    focus: true,
  }).state;

  const pane = started.panes[0];
  invariant(pane !== undefined, 'Expected the workspace to start a pane.');

  const reported = applyPiReport(started, {
    paneId: paneId(1),
    generation: pane.generation,
    process: { id: report.processId, startTime: 5000 },
    report: { ...report, sessionFile },
  });

  const context = contextOf(reported.state);

  await writeFile(sessionFile, '');

  expect(currentSession(context).panes[0]?.pi).toMatchObject({ sessionFileSaved: true });

  context.state = started;

  expect(currentSession(context).panes[0]?.pi).toBeUndefined();

  context.state = reported.state;

  await rm(sessionFile);

  expect(currentSession(context).panes[0]?.pi).toMatchObject({ sessionFileSaved: false });
});

it('keeps a restored session file saved after it is deleted, once its pi reopens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-state-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const sessionFile = join(directory, 'a.jsonl');

  await writeFile(sessionFile, '');

  const created = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/work/koja',
    label: 'koja',
    focus: true,
  }).state;

  const saved = savedSessionOf(created, { folders: new Map(), savedSessionFiles: new Set() });

  const restoredRecord: SavedPiRecord = {
    piVersion: '1.4.0',
    sessionId: 'session-a',
    sessionFile,
    leafId: undefined,
    provider: 'anthropic',
    model: 'sonnet',
    thinkingLevel: 'off',
    ownership: 'interactive',
    process: { id: report.processId, startTime: 5000 },
    state: 'reported',
    sessionFileSaved: true,
  };

  const session = {
    ...saved,
    panes: saved.panes.map(({ id, tabId, startFolder }) => ({
      id,
      tabId,
      startFolder,
      pi: restoredRecord,
    })),
  };

  const restored = applyIntent(createState(), { type: 'restoreSession', session });

  invariant(restored.kind === 'applied', 'The restore must apply.');

  const pane = restored.state.panes[0];
  invariant(pane !== undefined, 'Expected the restore to add a pane.');

  const reopened = applyPiReport(restored.state, {
    paneId: paneId(1),
    generation: pane.generation,
    process: { id: report.processId, startTime: 5000 },
    report: { ...report, sessionFile },
  });

  const context = contextOf(reopened.state);

  context.runtime.seenSessionFiles = savedSessionFilesOf({ kind: 'restored', session });

  await rm(sessionFile);

  expect(currentSession(context).panes[0]?.pi).toMatchObject({ sessionFileSaved: true });
});

const restoredStateWith = (sessionFile: string, sessionFileSaved: boolean): State => {
  const created = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/work/koja',
    label: 'koja',
    focus: true,
  }).state;

  const saved = savedSessionOf(created, { folders: new Map(), savedSessionFiles: new Set() });

  const restoredRecord: SavedPiRecord = {
    piVersion: '1.4.0',
    sessionId: 'session-a',
    sessionFile,
    leafId: undefined,
    provider: 'anthropic',
    model: 'sonnet',
    thinkingLevel: 'off',
    ownership: 'interactive',
    process: { id: report.processId, startTime: 5000 },
    state: 'reported',
    sessionFileSaved,
  };

  const session = {
    ...saved,
    panes: saved.panes.map(({ id, tabId, startFolder }) => ({
      id,
      tabId,
      startFolder,
      pi: restoredRecord,
    })),
  };

  const restored = applyIntent(createState(), { type: 'restoreSession', session });

  invariant(restored.kind === 'applied', 'The restore must apply.');

  return restored.state;
};

it('keeps a restored record saved after its file is seen by a save and then deleted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-state-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const sessionFile = join(directory, 'a.jsonl');

  await writeFile(sessionFile, '');

  const context = contextOf(restoredStateWith(sessionFile, false));

  expect(currentSession(context).panes[0]?.pi).toMatchObject({ sessionFileSaved: true });

  await rm(sessionFile);

  const savedPi = currentSession(context).panes[0]?.pi;

  expect(savedPi).toMatchObject({ sessionFile, sessionFileSaved: true });

  invariant(savedPi !== undefined, 'The pane keeps its pi record.');

  const recoveries = await checkPiRecoveries(new Map([[paneId(1), savedPi]]), {
    readSessionFile: readPiSessionFile,
    readLiveProcess: noLiveProcess,
  });

  expect(recoveries).toEqual(
    new Map([[paneId(1), { status: 'failed', reason: 'sessionFileMissing' }]]),
  );
});

it('keeps a restored record saved after its file is found at startup and then deleted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-state-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const sessionFile = join(directory, 'a.jsonl');

  await writeFile(sessionFile, '');

  const restored = restoredStateWith(sessionFile, false);
  const context = contextOf(restored);
  const session = savedSessionOf(restored, { folders: new Map(), savedSessionFiles: new Set() });

  context.runtime.seenSessionFiles = savedSessionFilesOf({ kind: 'restored', session });

  await rm(sessionFile);

  expect(currentSession(context).panes[0]?.pi).toMatchObject({ sessionFileSaved: true });
});

it('saves a restored record whose file never existed as not saved, and reopens it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-state-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const sessionFile = join(directory, 'never.jsonl');
  const context = contextOf(restoredStateWith(sessionFile, false));

  const savedPi = currentSession(context).panes[0]?.pi;

  expect(savedPi).toMatchObject({ sessionFile, sessionFileSaved: false });

  invariant(savedPi !== undefined, 'The pane keeps its pi record.');

  const recoveries = await checkPiRecoveries(new Map([[paneId(1), savedPi]]), {
    readSessionFile: readPiSessionFile,
    readLiveProcess: noLiveProcess,
  });

  expect(recoveries).toEqual(new Map([[paneId(1), { status: 'ready' }]]));
});

const sessionWithPis = (pis: SavedPi[]): SavedSession => {
  const created = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/work/koja',
    label: 'koja',
    focus: true,
  }).state;

  const saved = savedSessionOf(created, { folders: new Map(), savedSessionFiles: new Set() });
  const [pane] = saved.panes;

  invariant(pane !== undefined, 'The created workspace has a pane.');

  return { ...saved, panes: pis.map((pi) => ({ ...pane, pi })) };
};

const restoredRecordOf = (
  sessionFile: string | undefined,
  sessionFileSaved: boolean,
): SavedPiRecord => ({
  piVersion: '1.4.0',
  sessionId: 'session-a',
  sessionFile,
  leafId: undefined,
  provider: 'anthropic',
  model: 'sonnet',
  thinkingLevel: 'off',
  ownership: 'interactive',
  process: { id: report.processId, startTime: 5000 },
  state: 'reported',
  sessionFileSaved,
});

it('finds at startup only the saved session files that were saved or still exist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-session-state-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const existing = join(directory, 'existing.jsonl');
  const savedBefore = join(directory, 'saved-before.jsonl');
  const neverSaved = join(directory, 'never.jsonl');

  await writeFile(existing, '');

  const session = sessionWithPis([
    undefined,
    { kind: 'malformed', raw: {}, message: 'Not a pi record.' },
    restoredRecordOf(undefined, true),
    restoredRecordOf(existing, false),
    restoredRecordOf(savedBefore, true),
    restoredRecordOf(neverSaved, false),
  ]);

  expect(savedSessionFilesOf({ kind: 'restored', session })).toEqual(
    new Set([existing, savedBefore]),
  );
});

it('finds no saved session file at startup without a restored session', () => {
  expect(savedSessionFilesOf(undefined)).toEqual(new Set());
  expect(savedSessionFilesOf({ kind: 'missing' })).toEqual(new Set());
  expect(savedSessionFilesOf({ kind: 'broken', message: 'Not JSON.' })).toEqual(new Set());
});

it.each<[string, SavedPi]>([
  ['a malformed record', { kind: 'malformed', raw: { piVersion: 7 }, message: 'Not a pi record.' }],
  ['a record without a session file', restoredRecordOf(undefined, false)],
])('saves %s restored without a session file as it is', (_name, pi) => {
  const session = sessionWithPis([pi]);
  const restored = applyIntent(createState(), { type: 'restoreSession', session });

  invariant(restored.kind === 'applied', 'The restore must apply.');

  expect(currentSession(contextOf(restored.state)).panes[0]?.pi).toEqual(pi);
});
