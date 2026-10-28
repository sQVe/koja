import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { paneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { applyIntent, applyPiReport, createState } from '../store/store.ts';
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
  event: { kind: 'start', reason: 'startup' },
  sequence: 1,
};

const contextOf = (state: State) => ({ state, runtime: { panes: new Map() } });

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
