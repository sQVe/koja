import { expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { applyIntent, createState, savedSessionOf } from '../store/store.ts';
import type {
  Fact,
  Pane,
  PiRecovery,
  SavedPi,
  SavedPiRecord,
  SavedSession,
  State,
} from '../store/store.ts';
import { admitRestoredPane, checkSavedPi } from './piRecoveryStart.ts';

const record: SavedPiRecord = {
  piVersion: '1.4.0',
  sessionId: 'conversation-1',
  sessionFile: '/sessions/conversation-1.jsonl',
  leafId: undefined,
  provider: 'anthropic',
  model: 'opus',
  thinkingLevel: 'low',
  ownership: 'interactive',
  // No process has this id, so the saved pi never survives.
  process: { id: 0x7f_ff_ff_ff, startTime: 1 },
  state: 'reported',
  sessionFileSaved: true,
};

const savedWith = (pi: SavedPi): SavedSession => {
  const created = applyIntent(createState(), {
    type: 'createWorkspace',
    root: '/work',
    label: 'work',
    focus: true,
  });

  const saved = savedSessionOf(created.state, { folders: new Map(), savedSessionFiles: new Set() });

  const panes = saved.panes.map(({ id, tabId, startFolder }) => ({ id, tabId, startFolder, pi }));

  return { ...saved, panes };
};

const restoredWith = (pi: SavedPi): State => {
  const restored = applyIntent(createState(), { type: 'restoreSession', session: savedWith(pi) });

  invariant(restored.kind === 'applied', 'The restore must apply.');

  return restored.state;
};

const firstPane = (state: State): Pane => {
  const pane = state.panes[0];

  invariant(pane !== undefined, 'The pane is missing.');

  return pane;
};

const admitted = (state: State, recoveries: [PaneId, PiRecovery][], pane = firstPane(state)) => {
  const facts: Fact[] = [];
  const errors: unknown[] = [];

  const context = {
    options: {
      log: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: (_message: string, fields?: Record<string, unknown>) => {
          errors.push(fields);
        },
      },
    },
    state,
    runtime: { piRecoveries: new Map(recoveries) },
  };

  const admits = admitRestoredPane(context, pane, (fact) => facts.push(fact));

  return { admits, facts, errors, left: [...context.runtime.piRecoveries.keys()] };
};

it('checks each saved pi record of a restored session, and nothing for another read', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-pi-recovery-'));
  const sessionFile = join(directory, 'conversation.jsonl');

  try {
    const restored = { kind: 'restored', session: savedWith({ ...record, sessionFile }) } as const;

    expect(await checkSavedPi(restored)).toEqual(
      new Map([[paneId(1), { status: 'failed', reason: 'sessionFileMissing' }]]),
    );

    await writeFile(sessionFile, '{"type":"session","id":"conversation-1"}\n');

    expect(await checkSavedPi(restored)).toEqual(new Map([[paneId(1), { status: 'ready' }]]));

    const withoutPi = { kind: 'restored', session: savedWith(undefined) } as const;

    expect(await checkSavedPi(withoutPi)).toEqual(new Map());
    expect(await checkSavedPi({ kind: 'broken', message: 'bad' })).toEqual(new Map());
    expect(await checkSavedPi(undefined)).toEqual(new Map());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('reports a ready result once and lets the restored pane start', () => {
  const state = restoredWith(record);
  const { generation } = firstPane(state);

  expect(admitted(state, [[paneId(1), { status: 'ready' }]])).toEqual({
    admits: true,
    facts: [
      { type: 'piRecoveryChecked', paneId: paneId(1), generation, recovery: { status: 'ready' } },
    ],
    errors: [],
    left: [],
  });
});

it('fails a restored pane whose pi cannot reopen, naming the reason and the session file', () => {
  const state = restoredWith(record);
  const { generation } = firstPane(state);
  const recovery: PiRecovery = { status: 'failed', reason: 'sessionIdMismatch' };

  const message =
    'Saved pi conversation /sessions/conversation-1.jsonl cannot reopen: the file holds another conversation. Resolve it and restart the Koja server.';

  expect(admitted(state, [[paneId(1), recovery]])).toEqual({
    admits: false,
    facts: [
      { type: 'piRecoveryChecked', paneId: paneId(1), generation, recovery },
      { type: 'paneFailedToStart', paneId: paneId(1), generation, message },
    ],
    errors: [{ paneId: paneId(1), message }],
    left: [],
  });
});

it('names no session file for a blocked or malformed record that has none', () => {
  const blocked = restoredWith({ ...record, sessionFile: undefined });

  const malformed = restoredWith({
    kind: 'malformed',
    raw: { sessionFile: '/sessions/raw.jsonl' },
    message: 'bad',
  });

  const blockedFacts = admitted(blocked, [
    [paneId(1), { status: 'blocked', reason: 'processSurvives' }],
  ]).facts;

  const malformedFacts = admitted(malformed, [
    [paneId(1), { status: 'failed', reason: 'recordMalformed' }],
  ]).facts;

  expect(blockedFacts[1]).toMatchObject({
    message:
      'Saved pi conversation is blocked: the saved pi process still runs. Resolve it and restart the Koja server.',
  });

  expect(malformedFacts[1]).toMatchObject({
    message:
      'Saved pi conversation cannot reopen: the saved pi record is malformed. Resolve it and restart the Koja server.',
  });
});

it('starts a pane with no result, or one the restore did not add, without a fact', () => {
  const state = restoredWith(record);
  const failed: PiRecovery = { status: 'failed', reason: 'branchMissing' };
  const added = { ...firstPane(state), restored: false };

  expect(admitted(state, [])).toEqual({ admits: true, facts: [], errors: [], left: [] });

  expect(admitted(state, [[paneId(1), failed]], added)).toEqual({
    admits: true,
    facts: [],
    errors: [],
    left: [paneId(1)],
  });
});
