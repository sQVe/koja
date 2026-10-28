import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };
import { connectAttach, shownView } from '../src/client/client.ts';
import { paneId } from '../src/ids.ts';
import { layoutPanes, paneSize } from '../src/layout.ts';
import type { Layout } from '../src/layout.ts';
import { sessionGroups } from '../src/server/processGroups.ts';
import { ghosttyCommit } from '../src/vt/vt.ts';
import { cliTestTimeoutMs, temporaryDirectory } from './cliHarness.ts';
import { isRunning, waitFor } from './serverProcesses.ts';
import type { TestServer } from './sessionHarness.ts';
import { buildSetup, savedPiRecord, savePiRecords, setup } from './sessionHarness.ts';

const readText = (path: string): string => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

it(
  'brings the same workspaces, tabs, splits, zoom, and focus back after stop and start',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();
    await buildSetup(server);

    const before = await server.described();

    expect(before).toContain('"label":"Renamed"');
    expect(before).toContain('"zoomed":true');

    await server.koja(['server', 'stop']);
    await server.start();

    expect(await server.described()).toBe(before);
  },
  cliTestTimeoutMs,
);

it(
  'restores the setup as of the last change after the server is killed',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');
    const pid = await server.start();

    await buildSetup(server);
    await server.koja(['workspace', 'rename', 'workspace-2', 'Last']);

    const before = await server.described();
    const path = await server.sessionPath();
    const saved = await waitFor(() => readText(path).includes('"label":"Last"'));

    expect(saved).toBe(true);

    process.kill(pid, 'SIGKILL');

    expect(await waitFor(() => !isRunning(pid))).toBe(true);

    await server.start();

    expect(await server.described()).toBe(before);
  },
  cliTestTimeoutMs,
);

it(
  'preserves a broken save file and one with version 2, and starts with no workspace',
  async () => {
    const { serverAt, logText } = await setup();
    const server = serverAt('koja');

    await server.start();
    await server.createWorkspace('one');
    await server.koja(['server', 'stop']);

    const path = await server.sessionPath();
    const brokenText = '{"version":1,"session":';
    const newerText = '{"version":2,"session":{}}';

    await writeFile(path, brokenText);
    await server.start();

    expect(await server.workspaceIds()).toEqual([]);
    expect(await logText()).toContain(path);

    await server.koja(['server', 'stop']);

    expect(await readFile(`${path}.broken-1`, 'utf8')).toBe(brokenText);

    await writeFile(path, newerText);
    await server.start();

    expect(await server.workspaceIds()).toEqual([]);

    await server.koja(['server', 'stop']);

    expect(await readFile(`${path}.newer-1`, 'utf8')).toBe(newerText);
    expect(await readFile(`${path}.broken-1`, 'utf8')).toBe(brokenText);

    const lines = (await logText()).split('\n').filter((line) => line.includes(path));

    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain('"version":2');
  },
  cliTestTimeoutMs,
);

it(
  'keeps a separate save file for each socket path under one state folder',
  async () => {
    const { serverAt } = await setup();
    const alpha = serverAt('alpha');
    const beta = serverAt('beta');

    await alpha.start();
    await beta.start();

    const alphaWorkspace = await alpha.createWorkspace('alpha');

    await beta.createWorkspace('first');
    await beta.createWorkspace('second');

    expect(await alpha.sessionPath()).not.toBe(await beta.sessionPath());

    await alpha.koja(['server', 'stop']);
    await beta.koja(['server', 'stop']);
    await alpha.start();
    await beta.start();

    expect(await alpha.workspaceIds()).toEqual([alphaWorkspace]);
    expect(await beta.workspaceIds()).toEqual(['workspace-1', 'workspace-2']);
  },
  cliTestTimeoutMs,
);

it(
  'starts with no workspace after every workspace was closed',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();

    const first = await server.createWorkspace('one');
    const second = await server.createWorkspace('two');

    await server.koja(['workspace', 'close', first]);
    await server.koja(['workspace', 'close', second]);
    await server.koja(['server', 'stop']);
    await server.start();

    expect(await server.workspaceIds()).toEqual([]);
  },
  cliTestTimeoutMs,
);

const attachedFocus = async (socketPath: string): Promise<string | undefined> => {
  const commit = ghosttyCommit();

  if (!commit.ok) {
    throw new Error(commit.detail);
  }

  const version = { version: packageJson.version, ghostty: commit.commit };
  const result = await connectAttach(socketPath, version, { columns: 80, rows: 24 });

  if (!result.ok) {
    throw new Error(`Attach failed: ${result.reason}`);
  }

  const { session } = result;

  const attached = await waitFor(() => {
    const { snapshot } = session.getState();

    return snapshot.attachedClientId !== undefined && snapshot.clients.length === 1;
  });

  expect(attached).toBe(true);

  const focused = shownView(session.getState().snapshot).focusedWorkspaceId;

  session.detach();
  await session.closed;

  return focused;
};

it(
  'shows the workspace a CLI focus chose with no client attached, and restores it after a restart',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();

    const first = await server.createWorkspace('one');
    const second = await server.createWorkspace('two');

    expect(await attachedFocus(server.socketPath)).toBe(second);

    await server.koja(['workspace', 'focus', first]);

    expect(await attachedFocus(server.socketPath)).toBe(first);

    await server.koja(['server', 'stop']);
    await server.start();

    expect(await attachedFocus(server.socketPath)).toBe(first);
  },
  cliTestTimeoutMs,
);

const savedSplits = {
  kind: 'split',
  direction: 'right',
  ratio: 0.3,
  first: { kind: 'pane', paneId: 'pane-2' },
  second: {
    kind: 'split',
    direction: 'below',
    ratio: 0.7,
    first: { kind: 'pane', paneId: 'pane-3' },
    second: { kind: 'pane', paneId: 'pane-1' },
  },
};

const savedSession = (folder: string) => ({
  version: 1,
  session: {
    workspaces: [
      {
        id: 'workspace-1',
        root: folder,
        label: 'old',
        tabIds: ['tab-1'],
        activeTabId: 'tab-1',
      },
    ],
    tabs: [
      {
        id: 'tab-1',
        workspaceId: 'workspace-1',
        layout: savedSplits,
        focusedPaneId: 'pane-3',
        zoomedPaneId: null,
        label: null,
      },
    ],
    panes: ['pane-1', 'pane-2', 'pane-3'].map((id) => ({
      id,
      tabId: 'tab-1',
      startFolder: null,
    })),
    focusedWorkspaceId: 'workspace-1',
    nextWorkspaceNumber: 2,
    nextTabNumber: 2,
    nextPaneNumber: 4,
  },
});

const paneListSchema = z.array(
  z.object({
    id: z.string(),
    lifecycle: z.string(),
    focused: z.boolean(),
    columns: z.number(),
    rows: z.number(),
  }),
);

it(
  'restores the splits, panes, focus, and sizes of a version 1 file saved without arrangements',
  async () => {
    const { serverAt, environment } = await setup();
    const server = serverAt('koja');
    const folder = await temporaryDirectory();
    const starts = join(folder, 'starts.txt');
    const startScript = join(folder, 'start.sh');
    const path = await server.sessionPath();

    await writeFile(startScript, `echo "$KOJA_PANE_ID" >> ${starts}\n`);
    environment['ENV'] = startScript;
    await mkdir(dirname(path), { recursive: true });

    await writeFile(path, JSON.stringify(savedSession(folder)));

    await server.start();

    const expected = layoutPanes(savedSplits as Layout, paneSize(undefined))
      .map(({ paneId: id, terminal }) => ({
        id: id as string,
        lifecycle: 'running',
        focused: id === paneId(3),
        columns: terminal.columns,
        rows: terminal.rows,
      }))
      .toSorted((first, second) => first.id.localeCompare(second.id));

    const listed = async () =>
      paneListSchema.parse(JSON.parse(await server.koja(['pane', 'list', '--json'])));

    const restored = await waitFor(async () =>
      (await listed()).every((pane) => pane.lifecycle === 'running'),
    );

    expect(restored).toBe(true);
    expect(await listed()).toEqual(expected);
    expect(await server.workspaceIds()).toEqual(['workspace-1']);

    const started = await waitFor(() => readText(starts).split('\n').length > 3);

    expect(started).toBe(true);
    expect(readText(starts).split('\n').toSorted()).toEqual(['', 'pane-1', 'pane-2', 'pane-3']);
  },
  cliTestTimeoutMs,
);

const tabListSchema = z.array(
  z.object({
    id: z.string(),
    layout: z.unknown(),
    arrangement: z.object({ choice: z.string(), order: z.array(z.string()) }),
  }),
);

it(
  'keeps a restored tab saved without an arrangement legacy, and brings a new master tab back the same',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');
    const folder = await temporaryDirectory();
    const path = await server.sessionPath();

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(savedSession(folder)));
    await server.start();

    const tabs = async () =>
      tabListSchema.parse(JSON.parse(await server.koja(['tab', 'list', '--json'])));

    expect(await tabs()).toEqual([
      {
        id: 'tab-1',
        layout: savedSplits,
        arrangement: { choice: 'legacy', order: ['pane-2', 'pane-3', 'pane-1'] },
      },
    ]);

    await server.koja(['tab', 'create', '--workspace', 'workspace-1']);
    await server.koja(['pane', 'add', 'pane-4']);
    await server.koja(['pane', 'add', 'pane-4']);
    await server.koja(['pane', 'close', 'pane-5']);

    const before = await tabs();

    expect(before[1]?.arrangement).toEqual({ choice: 'master', order: ['pane-4', 'pane-6'] });

    await server.koja(['server', 'stop']);
    await server.start();

    expect(await tabs()).toEqual(before);
  },
  cliTestTimeoutMs,
);

const layoutOf = async (server: TestServer): Promise<string> => {
  const workspaces = await server.koja(['workspace', 'list', '--json']);
  const tabs = await server.koja(['tab', 'list', '--json']);

  return `${workspaces}\n${tabs}`;
};

it(
  'fails a restored pane whose pi session file is gone',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();
    await server.createWorkspace('one');
    await server.useLegacy('tab-1');

    const second = await server.split('pane-1');
    const layoutBefore = await layoutOf(server);
    const sessionFile = join(await temporaryDirectory(), 'conversation.jsonl');

    await server.koja(['server', 'stop']);
    await savePiRecords(await server.sessionPath(), { [second]: savedPiRecord({ sessionFile }) });
    await server.start();

    expect(await server.states()).toEqual({
      'pane-1': { lifecycle: 'running', error: null },
      [second]: {
        lifecycle: 'failed',
        error: `Saved pi conversation ${sessionFile} cannot reopen: the session file is missing. Resolve it and restart the Koja server.`,
      },
    });

    expect(await layoutOf(server)).toBe(layoutBefore);
  },
  cliTestTimeoutMs,
);

it(
  'keeps a failed and a blocked pi pane in place as failed panes that refuse input',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();
    await server.createWorkspace('one');
    await server.useLegacy('tab-1');

    const failed = await server.split('pane-1');
    const blocked = await server.split(failed);
    const layoutBefore = await layoutOf(server);
    const sessionFile = join(await temporaryDirectory(), 'conversation.jsonl');

    await server.koja(['server', 'stop']);

    await savePiRecords(await server.sessionPath(), {
      [failed]: savedPiRecord({ sessionFile, sessionId: 'failed' }),
      [blocked]: savedPiRecord({ ownership: 'tauWorker', sessionId: 'blocked' }),
    });

    await server.start();

    expect(await server.states()).toEqual({
      'pane-1': { lifecycle: 'running', error: null },
      [failed]: {
        lifecycle: 'failed',
        error: `Saved pi conversation ${sessionFile} cannot reopen: the session file is missing. Resolve it and restart the Koja server.`,
      },
      [blocked]: {
        lifecycle: 'failed',
        error:
          'Saved pi conversation is blocked: a Tau worker owns this pi. Resolve it and restart the Koja server.',
      },
    });

    expect(await layoutOf(server)).toBe(layoutBefore);

    for (const pane of [failed, blocked]) {
      const sent = await server.attempt(['pane', 'send', 'echo typed\n', '--pane', pane]);

      expect(sent.exitCode).toBe(1);
      expect(sent.stdout).toBe('');
      expect(sent.stderr).not.toBe('');
    }

    expect((await server.states())[failed]?.lifecycle).toBe('failed');
    expect((await server.states())[blocked]?.lifecycle).toBe('failed');
  },
  cliTestTimeoutMs,
);

const shellPidSchema = z.object({ shell_pid: z.number() });

const savedPiOf = async (path: string, pane: string): Promise<unknown> => {
  const saved = z
    .object({
      session: z.object({ panes: z.array(z.object({ id: z.string(), pi: z.unknown() })) }),
    })
    .parse(JSON.parse(await readFile(path, 'utf8')));

  return saved.session.panes.find((known) => known.id === pane)?.pi;
};

it(
  'starts only the shell of a pane whose saved pi conversation can reopen, and keeps its record',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();

    const workspace = await server.createWorkspace('one');
    const folder = await temporaryDirectory();
    const sessionFile = join(folder, 'conversation.jsonl');
    const path = await server.sessionPath();
    const record = savedPiRecord({ sessionFile, leafId: 'leaf-1' });

    await writeFile(sessionFile, '{"type":"session","id":"conversation-1"}\n{"id":"leaf-1"}\n');
    await server.koja(['server', 'stop']);
    await savePiRecords(path, { 'pane-1': record });
    await server.start();

    expect(await server.states()).toEqual({ 'pane-1': { lifecycle: 'running', error: null } });

    const answer = join(folder, 'answer.txt');

    await server.koja(['pane', 'send', `echo $((40 + 2)) > ${answer}\n`, '--pane', 'pane-1']);

    expect(await waitFor(() => readText(answer) === '42\n')).toBe(true);

    const shellPid = shellPidSchema.parse(
      JSON.parse(await server.koja(['pane', 'process-info', 'pane-1', '--json'])),
    ).shell_pid;

    expect(sessionGroups(shellPid)).toEqual([shellPid]);

    await server.koja(['workspace', 'rename', workspace, 'Saved again']);

    const saved = await waitFor(() => readText(path).includes('"label":"Saved again"'));

    expect(saved).toBe(true);
    expect(await savedPiOf(path, 'pane-1')).toEqual(record);
  },
  cliTestTimeoutMs,
);
