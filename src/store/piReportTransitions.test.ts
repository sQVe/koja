import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { applyGonePiQuit, applyIntent, applyPiReport, piRecordOf } from './store.ts';
import type { PiEvent, PiProcess, PiReport, State } from './store.ts';
import { attachLarge, createKoja, defined, run, runLegacy, splitFirst } from './storeFixtures.ts';

const firstProcess: PiProcess = { id: 100, startTime: 5000 };

const secondProcess: PiProcess = { id: 200, startTime: 6000 };

const startup: PiEvent = { kind: 'start', reason: 'startup' };

const reportOf = (process: PiProcess, overrides: Partial<PiReport> = {}): PiReport => ({
  processId: process.id,
  piVersion: '1.4.0',
  sessionId: 'session-a',
  sessionFile: '/sessions/a.jsonl',
  leafId: 'leaf-1',
  provider: 'anthropic',
  model: 'sonnet',
  thinkingLevel: 'off',
  ownership: 'interactive',
  event: startup,
  sequence: 1,
  ...overrides,
});

const startedState = (): State => run([createKoja]);

const generationOf = (state: State, id: PaneId): number =>
  defined(state.panes.find((pane) => pane.id === id)).generation;

const inputFor = (state: State, process: PiProcess, overrides: Partial<PiReport> = {}) => ({
  paneId: paneId(1),
  generation: generationOf(state, paneId(1)),
  process,
  report: reportOf(process, overrides),
});

const appliedState = (result: ReturnType<typeof applyPiReport>): State =>
  defined(result.kind === 'applied' ? result.state : undefined);

const after = (state: State, process: PiProcess, overrides: Partial<PiReport> = {}): State =>
  appliedState(applyPiReport(state, inputFor(state, process, overrides)));

const reportedState = (): State => after(startedState(), firstProcess);

const goneQuitFor = (state: State, overrides: Partial<PiReport> = {}) => ({
  paneId: paneId(1),
  generation: generationOf(state, paneId(1)),
  report: reportOf(firstProcess, {
    event: { kind: 'shutdown', reason: 'quit' },
    sequence: 2,
    ...overrides,
  }),
});

it('records the first start report of a pane', () => {
  const state = startedState();

  const result = applyPiReport(state, inputFor(state, firstProcess));

  expect(result).toMatchObject({ kind: 'applied', status: 'recorded' });

  expect(piRecordOf(appliedState(result), paneId(1))).toStrictEqual({
    state: 'reported',
    generation: 1,
    process: firstProcess,
    sequence: 1,
    report: reportOf(firstProcess),
  });
});

it('shows a switch as switching until a start report from the same process replaces the session', () => {
  const switching = after(reportedState(), firstProcess, {
    event: { kind: 'shutdown', reason: 'new' },
    sequence: 2,
  });

  expect(piRecordOf(switching, paneId(1))?.state).toBe('switching');

  const started = {
    event: { kind: 'start', reason: 'new' },
    sequence: 3,
    sessionId: 'session-b',
  } as const;

  const result = applyPiReport(switching, inputFor(switching, firstProcess, started));

  expect(result).toMatchObject({ kind: 'applied', status: 'updated' });

  expect(piRecordOf(appliedState(result), paneId(1))).toStrictEqual({
    state: 'reported',
    generation: 1,
    process: firstProcess,
    sequence: 3,
    report: reportOf(firstProcess, started),
  });
});

it.each([
  ['tree', { event: { kind: 'tree' }, leafId: 'leaf-2' }],
  ['model', { event: { kind: 'model' }, provider: 'openai', model: 'gpt' }],
  ['thinking', { event: { kind: 'thinking' }, thinkingLevel: 'high' }],
] as const)('refreshes the fields of a reported record on a %s report', (_name, overrides) => {
  const changes = { ...overrides, sequence: 2 };
  const result = applyPiReport(reportedState(), inputFor(reportedState(), firstProcess, changes));

  expect(result).toMatchObject({ kind: 'applied', status: 'updated' });

  expect(piRecordOf(appliedState(result), paneId(1))).toStrictEqual({
    state: 'reported',
    generation: 1,
    process: firstProcess,
    sequence: 2,
    report: reportOf(firstProcess, changes),
  });
});

it('keeps a switching record switching on a model report and stores its fields', () => {
  const switching = after(reportedState(), firstProcess, {
    event: { kind: 'shutdown', reason: 'resume' },
    sequence: 2,
  });

  const changes = { event: { kind: 'model' }, model: 'opus', sequence: 3 } as const;
  const next = after(switching, firstProcess, changes);

  expect(piRecordOf(next, paneId(1))).toStrictEqual({
    state: 'switching',
    generation: 1,
    process: firstProcess,
    sequence: 3,
    report: reportOf(firstProcess, changes),
  });
});

it('makes the record exited on quit and keeps it exited after a delayed lower-sequence start', () => {
  const exited = after(reportedState(), firstProcess, {
    event: { kind: 'shutdown', reason: 'quit' },
    sequence: 3,
  });

  expect(piRecordOf(exited, paneId(1))).toMatchObject({ state: 'exited', sequence: 3 });

  const result = applyPiReport(
    exited,
    inputFor(exited, firstProcess, { sequence: 2, sessionId: 'session-b' }),
  );

  expect(result).toMatchObject({ kind: 'applied', status: 'ignored' });
  expect(result.state).toBe(exited);
});

it.each([
  ['a lower', 1],
  ['the same', 2],
])('ignores a report from the recorded process with %s sequence', (_name, sequence) => {
  const reported = after(reportedState(), firstProcess, { event: { kind: 'tree' }, sequence: 2 });

  const result = applyPiReport(
    reported,
    inputFor(reported, firstProcess, { event: { kind: 'tree' }, leafId: 'leaf-old', sequence }),
  );

  expect(result).toMatchObject({ kind: 'applied', status: 'ignored' });
  expect(result.state).toBe(reported);
});

it.each([
  ['another process', secondProcess],
  ['a reused process id with a different start time', { id: firstProcess.id, startTime: 5001 }],
  ['another process id with the same start time', { id: 101, startTime: firstProcess.startTime }],
])('makes a fresh record without earlier identity when %s starts', (_name, process: PiProcess) => {
  const reported = after(reportedState(), firstProcess, { sequence: 9 });
  const fresh = { sessionId: 'session-b', sessionFile: undefined, leafId: undefined };

  const result = applyPiReport(reported, inputFor(reported, process, fresh));

  expect(result).toMatchObject({ kind: 'applied', status: 'recorded' });

  expect(piRecordOf(appliedState(result), paneId(1))).toStrictEqual({
    state: 'reported',
    generation: 1,
    process,
    sequence: 1,
    report: reportOf(process, fresh),
  });
});

it('makes a fresh reported record when another process starts after a quit', () => {
  const exited = after(reportedState(), firstProcess, {
    event: { kind: 'shutdown', reason: 'quit' },
    sequence: 2,
  });

  const next = after(exited, secondProcess);

  expect(piRecordOf(next, paneId(1))).toMatchObject({
    state: 'reported',
    process: secondProcess,
    sequence: 1,
  });
});

it.each<[string, PiEvent]>([
  ['tree', { kind: 'tree' }],
  ['model', { kind: 'model' }],
  ['thinking', { kind: 'thinking' }],
  ['shutdown for a switch', { kind: 'shutdown', reason: 'new' }],
  ['shutdown for quit', { kind: 'shutdown', reason: 'quit' }],
])('refuses a %s report from a process other than the recorded one', (_name, event) => {
  const reported = reportedState();

  const result = applyPiReport(reported, inputFor(reported, secondProcess, { event, sequence: 5 }));

  expect(result).toMatchObject({ kind: 'rejected', reason: 'processNotRecorded' });
  expect(result.state).toBe(reported);
});

it('refuses a first report of a pane that is not a start', () => {
  const state = startedState();

  const result = applyPiReport(state, inputFor(state, firstProcess, { event: { kind: 'model' } }));

  expect(result).toMatchObject({ kind: 'rejected', reason: 'processNotRecorded' });
  expect(result.state).toBe(state);
});

it('throws for a report that names a process other than the one it came from', () => {
  const state = startedState();

  expect(() =>
    applyPiReport(state, { ...inputFor(state, firstProcess), process: secondProcess }),
  ).toThrow('A pi report names its own process.');
});

it('refuses a report for a pane the state does not know', () => {
  const state = startedState();

  const result = applyPiReport(state, { ...inputFor(state, firstProcess), paneId: paneId(9) });

  expect(result).toMatchObject({ kind: 'rejected', reason: 'unknownPane' });
  expect(result.state).toBe(state);
});

it('refuses a report for an earlier generation of a pane', () => {
  const state = reportedState();

  const result = applyPiReport(state, {
    ...inputFor(state, firstProcess, { event: { kind: 'tree' }, sequence: 2 }),
    generation: generationOf(state, paneId(1)) - 1,
  });

  expect(result).toMatchObject({ kind: 'rejected', reason: 'staleGeneration' });
  expect(result.state).toBe(state);
});

it('makes the record exited on a quit from its gone process with a greater sequence', () => {
  const reported = reportedState();

  const result = applyGonePiQuit(reported, goneQuitFor(reported));

  expect(result).toMatchObject({ kind: 'applied', status: 'updated' });

  expect(piRecordOf(appliedState(result), paneId(1))).toStrictEqual({
    state: 'exited',
    generation: 1,
    process: firstProcess,
    sequence: 2,
    report: reportOf(firstProcess),
  });
});

it('ignores a quit from a gone process whose sequence is not greater than the record', () => {
  const reported = after(reportedState(), firstProcess, { event: { kind: 'tree' }, sequence: 4 });

  const result = applyGonePiQuit(reported, goneQuitFor(reported, { sequence: 4 }));

  expect(result).toMatchObject({ kind: 'applied', status: 'ignored' });
  expect(result.state).toBe(reported);
});

it.each<[string, Partial<PiReport>]>([
  ['a switch', { event: { kind: 'shutdown', reason: 'new' } }],
  ['a start', { event: startup }],
  ['a model change', { event: { kind: 'model' } }],
  ['quit from another process id', { processId: secondProcess.id }],
])('refuses %s from a gone process', (_name, overrides) => {
  const reported = reportedState();

  const result = applyGonePiQuit(reported, goneQuitFor(reported, overrides));

  expect(result).toMatchObject({ kind: 'rejected', reason: 'processNotInPane' });
  expect(result.state).toBe(reported);
});

it('refuses a quit from a gone process when the pane has no record', () => {
  const state = startedState();

  const result = applyGonePiQuit(state, goneQuitFor(state));

  expect(result).toMatchObject({ kind: 'rejected', reason: 'processNotInPane' });
  expect(result.state).toBe(state);
});

it('refuses a quit from a gone process of an earlier generation', () => {
  const reported = reportedState();

  const result = applyGonePiQuit(reported, {
    ...goneQuitFor(reported),
    generation: generationOf(reported, paneId(1)) - 1,
  });

  expect(result).toMatchObject({ kind: 'rejected', reason: 'staleGeneration' });
  expect(result.state).toBe(reported);
});

it('refuses a quit from a gone process for a pane the state does not know', () => {
  const reported = reportedState();

  const result = applyGonePiQuit(reported, { ...goneQuitFor(reported), paneId: paneId(9) });

  expect(result).toMatchObject({ kind: 'rejected', reason: 'unknownPane' });
  expect(result.state).toBe(reported);
});

it('drops the record of a pane the state no longer has when another pane reports', () => {
  const split = runLegacy([attachLarge, createKoja, splitFirst('right')]);
  const recorded = after(split, firstProcess);
  const closed = applyIntent(recorded, { type: 'closePane', paneId: paneId(1) }).state;

  const result = applyPiReport(closed, {
    paneId: paneId(2),
    generation: generationOf(closed, paneId(2)),
    process: secondProcess,
    report: reportOf(secondProcess),
  });

  const next = appliedState(result);

  expect(next.piReports.has(paneId(1))).toBe(false);
  expect(piRecordOf(next, paneId(2))).toMatchObject({ state: 'reported', process: secondProcess });
});

it('hides a record of another generation of the pane', () => {
  const reported = reportedState();
  const [pane] = reported.panes;
  const generation = reported.nextGeneration;

  const restarted: State = {
    ...reported,
    panes: [{ ...defined(pane), generation }],
    nextGeneration: generation + 1,
  };

  expect(restarted.piReports.has(paneId(1))).toBe(true);
  expect(piRecordOf(restarted, paneId(1))).toBeUndefined();
});

it('ignores a record of an earlier generation when a process of the new generation starts', () => {
  const reported = after(reportedState(), firstProcess, { sequence: 7 });
  const [pane] = reported.panes;
  const generation = reported.nextGeneration;

  const restarted: State = {
    ...reported,
    panes: [{ ...defined(pane), generation }],
    nextGeneration: generation + 1,
  };

  const next = after(restarted, firstProcess, { sequence: 1, sessionId: 'session-b' });

  expect(piRecordOf(next, paneId(1))).toMatchObject({
    state: 'reported',
    generation,
    sequence: 1,
    report: { sessionId: 'session-b' },
  });
});

it('hides the record of a pane the state no longer has', () => {
  const split = runLegacy([attachLarge, createKoja, splitFirst('right')]);
  const recorded = after(split, firstProcess);
  const closed = applyIntent(recorded, { type: 'closePane', paneId: paneId(1) }).state;

  expect(closed.piReports.has(paneId(1))).toBe(true);
  expect(piRecordOf(closed, paneId(1))).toBeUndefined();
});
