import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { applyPiReport, savedSessionOf } from './store.ts';
import type { PiProcess, PiReport, SavedPiRecord, SavedSession, State } from './store.ts';
import {
  attachedEmpty,
  createKoja,
  defined,
  fact,
  intent,
  noReads,
  run,
  splitFirst,
} from './storeFixtures.ts';

const livePiProcess: PiProcess = { id: 300, startTime: 7000 };

const restoredRecord: SavedPiRecord = {
  piVersion: '1.3.0',
  sessionId: 'restored',
  sessionFile: '/sessions/restored.jsonl',
  leafId: 'leaf-restored',
  provider: 'anthropic',
  model: 'opus',
  thinkingLevel: 'high',
  ownership: 'interactive',
  process: { id: 100, startTime: 5000 },
  state: 'reported',
  sessionFileSaved: true,
};

const liveReport: PiReport = {
  processId: livePiProcess.id,
  piVersion: '1.4.0',
  sessionId: 'live',
  sessionFile: '/sessions/live.jsonl',
  leafId: 'leaf-live',
  provider: 'openai',
  model: 'gpt',
  thinkingLevel: 'off',
  ownership: 'tauWorker',
  event: { kind: 'start', reason: 'startup' },
  sequence: 1,
};

const restoredWithPi = (): State => {
  const saved = savedSessionOf(run([createKoja, splitFirst('right')]), noReads);

  const session: SavedSession = {
    ...saved,
    panes: saved.panes.map(({ id, tabId, startFolder }) => ({
      id,
      tabId,
      startFolder,
      pi: restoredRecord,
    })),
  };

  return intent(attachedEmpty(), { type: 'restoreSession', session }).state;
};

const paneOf = (state: State, id: number) =>
  defined(state.panes.find((pane) => pane.id === paneId(id)));

const reported = (state: State, report: PiReport = liveReport): State => {
  const result = applyPiReport(state, {
    paneId: paneId(1),
    generation: paneOf(state, 1).generation,
    process: livePiProcess,
    report,
  });

  return defined(result.kind === 'applied' ? result.state : undefined);
};

const savedPiOf = (state: State, files: ReadonlySet<string> = new Set()) =>
  savedSessionOf(state, { ...noReads, savedSessionFiles: files }).panes.map((pane) => pane.pi);

it('saves a live pi record over the restored one, and keeps the restored one of a failed pane', () => {
  const restored = restoredWithPi();

  const started = fact(restored, {
    type: 'paneStarted',
    paneId: paneId(1),
    generation: paneOf(restored, 1).generation,
  }).state;

  const failed = fact(started, {
    type: 'paneFailedToStart',
    paneId: paneId(2),
    generation: paneOf(started, 2).generation,
    message: 'no shell',
  }).state;

  expect(paneOf(failed, 2).lifecycle).toBe('failed');
  expect(savedPiOf(failed)).toEqual([restoredRecord, restoredRecord]);

  const live = reported(failed);

  expect(savedPiOf(live, new Set(['/sessions/live.jsonl']))).toStrictEqual([
    {
      piVersion: '1.4.0',
      sessionId: 'live',
      sessionFile: '/sessions/live.jsonl',
      leafId: 'leaf-live',
      provider: 'openai',
      model: 'gpt',
      thinkingLevel: 'off',
      ownership: 'tauWorker',
      process: livePiProcess,
      state: 'reported',
      sessionFileSaved: true,
    },
    restoredRecord,
  ]);
});

it('saves no pi record once the live pi quits, rather than the restored one', () => {
  const restored = restoredWithPi();

  const started = fact(restored, {
    type: 'paneStarted',
    paneId: paneId(1),
    generation: paneOf(restored, 1).generation,
  }).state;

  const quit = reported(reported(started), {
    ...liveReport,
    event: { kind: 'shutdown', reason: 'quit' },
    sequence: 2,
  });

  expect(savedPiOf(quit)).toEqual([undefined, restoredRecord]);
});

it('saves a live record whose session file is not on disk as not saved', () => {
  const restored = restoredWithPi();

  const started = fact(restored, {
    type: 'paneStarted',
    paneId: paneId(1),
    generation: paneOf(restored, 1).generation,
  }).state;

  expect(savedPiOf(reported(started))[0]).toMatchObject({ sessionFileSaved: false });
});

it('drops the restored pi record of a closed pane and of a closed tab', () => {
  const restored = restoredWithPi();
  const closedPane = intent(restored, { type: 'closePane', paneId: paneId(2) }).state;
  const closedTab = intent(closedPane, { type: 'closePane', paneId: paneId(1) }).state;

  expect(savedPiOf(closedPane)).toEqual([restoredRecord]);
  expect([...closedPane.restoredPi.keys()]).toEqual([paneId(1)]);
  expect(closedTab.restoredPi.size).toBe(0);
});

it('keeps a restored record, under its new generation, only for a pane saved with one', () => {
  const saved = savedSessionOf(run([createKoja, splitFirst('right')]), noReads);
  const [first, second] = saved.panes;

  const session: SavedSession = {
    ...saved,
    panes: [defined(first), { ...defined(second), pi: restoredRecord }],
  };

  const restored = intent(attachedEmpty(), { type: 'restoreSession', session }).state;

  expect([...restored.restoredPi]).toEqual([
    [paneId(2), { generation: paneOf(restored, 2).generation, pi: restoredRecord }],
  ]);
});
