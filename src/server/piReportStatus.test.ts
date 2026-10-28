import { expect, it, onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import type { RunningPane } from './paneRecord.ts';
import { fixture, identity, target } from './piReportFixtures.ts';
import { answerPiStatus } from './piReports.ts';

const sessionDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-pi-reports-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
};

it.each([
  ['a Tau worker', { ownership: 'tauWorker' }, 'saved', ['tauWorker']],
  ['a pi without a session file', { ownership: 'interactive' }, undefined, ['noSessionFile']],
  ['a session file not on disk', { ownership: 'interactive' }, 'missing', ['sessionNotSaved']],
  ['a session path that is a folder', { ownership: 'interactive' }, 'folder', ['sessionNotSaved']],
  ['a relative session path', { ownership: 'interactive' }, 'relative', ['sessionNotSaved']],
  ['a saved interactive session', { ownership: 'interactive' }, 'saved', []],
] as const)(
  'gives the recovery reasons of %s',
  async (_name, changes, sessionFileKind, ineligibleReasons) => {
    const directory = await sessionDirectory();
    const saved = join(directory, 'saved.jsonl');
    const folder = join(directory, 'folder.jsonl');

    await writeFile(saved, '{}\n');
    await mkdir(folder);

    const sessionFiles = {
      saved,
      folder,
      missing: join(directory, 'missing.jsonl'),
      relative: relative(process.cwd(), saved),
    };

    const sessionFile = sessionFileKind === undefined ? undefined : sessionFiles[sessionFileKind];
    const { connection, context, messages, sendReport } = fixture();

    sendReport({ ...changes, sessionFile });
    answerPiStatus(context, target, connection);

    expect(messages.at(-1)).toEqual({
      type: 'piStatusReply',
      paneId: target,
      pi: {
        state: 'reported',
        ...identity,
        ...changes,
        sessionFile,
        ineligibleReasons: [...ineligibleReasons],
      },
      recovery: null,
    });
  },
);

it('records a live process and reports its identity without its process id or pass', () => {
  const { context, connection, messages, sendReport } = fixture();

  sendReport();
  answerPiStatus(context, target, connection);

  expect(messages).toEqual([
    { type: 'piReportResult', result: { ok: true, status: 'recorded' } },
    {
      type: 'piStatusReply',
      paneId: target,
      pi: { state: 'reported', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
      recovery: null,
    },
  ]);
});

it('shows the record of a pane without a runtime entry as lost', () => {
  const { context, connection, messages, sendReport } = fixture();

  sendReport();

  const unregistered = { ...context, runtime: { panes: new Map<PaneId, RunningPane>() } };

  answerPiStatus(unregistered, target, connection);

  expect(messages.at(-1)).toEqual({
    type: 'piStatusReply',
    paneId: target,
    pi: { state: 'lost', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
    recovery: null,
  });
});

it('shows a record as lost when its process has left the pane shell session', () => {
  const { context, connection, messages, running, sendReport } = fixture();

  sendReport();
  running.runtime.processId += 1;
  answerPiStatus(context, target, connection);

  expect(messages.at(-1)).toEqual({
    type: 'piStatusReply',
    paneId: target,
    pi: { state: 'lost', ...identity, ineligibleReasons: ['tauWorker', 'noSessionFile'] },
    recovery: null,
  });
});

it('replies unknownPane to a status request for a pane the store does not know', () => {
  const { context, connection, messages } = fixture();

  answerPiStatus(context, paneId(9), connection);

  expect(messages).toEqual([{ type: 'paneFailed', reason: 'unknownPane', message: undefined }]);
});
