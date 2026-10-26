import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { applyIntent, applyPiReport, piRecordOf } from './store.ts';
import type { PiProcess, PiReport, State } from './store.ts';
import { attachLarge, createKoja, defined, run, splitFirst } from './storeFixtures.ts';

const firstProcess: PiProcess = { id: 100, startTime: 5000 };

const secondProcess: PiProcess = { id: 200, startTime: 6000 };

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

it('records the first report of a pane', () => {
  const state = startedState();

  const result = applyPiReport(state, inputFor(state, firstProcess));

  expect(result).toMatchObject({ kind: 'applied', status: 'recorded' });

  expect(
    piRecordOf(defined(result.kind === 'applied' ? result.state : undefined), paneId(1)),
  ).toStrictEqual({
    state: 'reported',
    generation: 1,
    process: firstProcess,
    report: reportOf(firstProcess),
  });
});

it('keeps the same state object for an identical report', () => {
  const state = startedState();
  const recorded = applyPiReport(state, inputFor(state, firstProcess));
  const reported = defined(recorded.kind === 'applied' ? recorded.state : undefined);

  const result = applyPiReport(reported, inputFor(reported, firstProcess));

  expect(result).toMatchObject({ kind: 'applied', status: 'unchanged' });
  expect(result.state).toBe(reported);
});

it('marks the record changed and drops its identity when the same process reports a different session', () => {
  const state = startedState();
  const recorded = applyPiReport(state, inputFor(state, firstProcess));
  const reported = defined(recorded.kind === 'applied' ? recorded.state : undefined);

  const result = applyPiReport(
    reported,
    inputFor(reported, firstProcess, { sessionId: 'session-b' }),
  );

  const changed = defined(result.kind === 'applied' ? result.state : undefined);

  expect(result).toMatchObject({ kind: 'applied', status: 'changed' });

  expect(piRecordOf(changed, paneId(1))).toStrictEqual({
    state: 'changed',
    generation: 1,
    process: firstProcess,
  });
});

it('keeps a changed record changed for the same process and leaves the state as it is', () => {
  const state = startedState();
  const recorded = applyPiReport(state, inputFor(state, firstProcess));
  const reported = defined(recorded.kind === 'applied' ? recorded.state : undefined);

  const changedResult = applyPiReport(
    reported,
    inputFor(reported, firstProcess, { leafId: 'leaf-2' }),
  );

  const changed = defined(changedResult.kind === 'applied' ? changedResult.state : undefined);

  const result = applyPiReport(changed, inputFor(changed, firstProcess, { leafId: 'leaf-3' }));

  expect(result).toMatchObject({ kind: 'applied', status: 'changed' });
  expect(result.state).toBe(changed);
});

it('replaces the record when another process reports for the same pane', () => {
  const state = startedState();
  const recorded = applyPiReport(state, inputFor(state, firstProcess));
  const reported = defined(recorded.kind === 'applied' ? recorded.state : undefined);

  const result = applyPiReport(reported, inputFor(reported, secondProcess));
  const replaced = defined(result.kind === 'applied' ? result.state : undefined);

  expect(result).toMatchObject({ kind: 'applied', status: 'recorded' });

  expect(piRecordOf(replaced, paneId(1))).toStrictEqual({
    state: 'reported',
    generation: 1,
    process: secondProcess,
    report: reportOf(secondProcess),
  });
});

it('refuses a report for a pane the state does not know', () => {
  const state = startedState();

  const result = applyPiReport(state, { ...inputFor(state, firstProcess), paneId: paneId(9) });

  expect(result).toMatchObject({ kind: 'rejected', reason: 'unknownPane' });
  expect(result.state).toBe(state);
});

it('refuses a report for an earlier generation of a pane', () => {
  const state = startedState();

  const result = applyPiReport(state, {
    ...inputFor(state, firstProcess),
    generation: generationOf(state, paneId(1)) - 1,
  });

  expect(result).toMatchObject({ kind: 'rejected', reason: 'staleGeneration' });
  expect(result.state).toBe(state);
});

it('drops the record of a pane the state no longer has when another pane reports', () => {
  const split = run([attachLarge, createKoja, splitFirst('right')]);
  const reported = applyPiReport(split, inputFor(split, firstProcess));
  const recorded = defined(reported.kind === 'applied' ? reported.state : undefined);
  const closed = applyIntent(recorded, { type: 'closePane', paneId: paneId(1) }).state;

  const result = applyPiReport(closed, {
    paneId: paneId(2),
    generation: generationOf(closed, paneId(2)),
    process: secondProcess,
    report: reportOf(secondProcess),
  });

  const next = defined(result.kind === 'applied' ? result.state : undefined);

  expect(next.piReports.has(paneId(1))).toBe(false);
  expect(piRecordOf(next, paneId(2))).toMatchObject({ state: 'reported', process: secondProcess });
});

it.each([
  ['a reused process id with a different start time', { id: firstProcess.id, startTime: 5001 }],
  ['another process id with the same start time', { id: 101, startTime: firstProcess.startTime }],
])('replaces the record when %s reports for the same pane', (_name, process: PiProcess) => {
  const state = startedState();
  const recorded = applyPiReport(state, inputFor(state, firstProcess));
  const reported = defined(recorded.kind === 'applied' ? recorded.state : undefined);

  const result = applyPiReport(reported, inputFor(reported, process, { sessionId: 'session-b' }));
  const replaced = defined(result.kind === 'applied' ? result.state : undefined);

  expect(result).toMatchObject({ kind: 'applied', status: 'recorded' });

  expect(piRecordOf(replaced, paneId(1))).toStrictEqual({
    state: 'reported',
    generation: 1,
    process,
    report: reportOf(process, { sessionId: 'session-b' }),
  });
});

it('hides a record of another generation of the pane', () => {
  const state = startedState();
  const recorded = applyPiReport(state, inputFor(state, firstProcess));
  const reported = defined(recorded.kind === 'applied' ? recorded.state : undefined);

  const [pane] = reported.panes;
  const generation = reported.nextGeneration;

  // A pane that starts again keeps its id under a new generation.
  const restarted: State = {
    ...reported,
    panes: [{ ...defined(pane), generation }],
    nextGeneration: generation + 1,
  };

  expect(restarted.piReports.has(paneId(1))).toBe(true);
  expect(piRecordOf(restarted, paneId(1))).toBeUndefined();
});

it('hides the record of a pane the state no longer has', () => {
  const split = run([attachLarge, createKoja, splitFirst('right')]);
  const reported = applyPiReport(split, inputFor(split, firstProcess));
  const recorded = defined(reported.kind === 'applied' ? reported.state : undefined);
  const closed = applyIntent(recorded, { type: 'closePane', paneId: paneId(1) }).state;

  expect(closed.piReports.has(paneId(1))).toBe(true);
  expect(piRecordOf(closed, paneId(1))).toBeUndefined();
});
