import { expect, it } from 'bun:test';

import { paneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { applyIntent, applyPiReport, createState, piRecordOf } from '../store/store.ts';
import type { PiReport, State } from '../store/store.ts';
import { currentSession } from './sessionState.ts';

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
};

const contextOf = (state: State) => ({ state, runtime: { panes: new Map() } });

it('saves the same session after a pi report', () => {
  const started = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/work/koja',
    label: 'koja',
    focus: true,
  }).state;

  const pane = started.panes[0];
  invariant(pane !== undefined, 'Expected the workspace to start a pane.');

  const before = currentSession(contextOf(started));

  const reported = applyPiReport(started, {
    paneId: paneId(1),
    generation: pane.generation,
    process: { id: report.processId, startTime: 5000 },
    report,
  });

  expect(reported.kind).toBe('applied');
  expect(piRecordOf(reported.state, paneId(1))).toBeDefined();
  expect(currentSession(contextOf(reported.state))).toEqual(before);
});
