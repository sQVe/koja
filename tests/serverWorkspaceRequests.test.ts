import { expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { paneId, workspaceId } from '../src/ids.ts';
import type { PaneId } from '../src/ids.ts';
import type { TestClient } from './serverHarness.ts';
import {
  readRecent,
  linesOf,
  temporaryDirectory,
  waitFor,
  startEmptyServer,
  createWorkspace,
  startServer,
  applyRows,
  receiveText,
  attachTerminal,
  connectCli,
  nextOfType,
  useLegacyLayout,
} from './serverHarness.ts';

it('starts with no workspace and adds one focused workspace for each workspaceCreate', async () => {
  const directory = await temporaryDirectory();
  const first = join(directory, 'first');
  const second = join(directory, 'second');

  await mkdir(first);
  await mkdir(second);

  const { server, socketPath } = await startEmptyServer(directory);

  expect(server.snapshot()).toMatchObject({ workspaces: [], tabs: [], panes: [] });

  const answers = [
    await createWorkspace(socketPath, first, 'first'),
    await createWorkspace(socketPath, second, 'second'),
  ];

  const { workspaces, tabs, panes, defaultView } = server.snapshot();

  expect(answers).toEqual([
    { type: 'workspaceDone', workspaceId: workspaceId(1) },
    { type: 'workspaceDone', workspaceId: workspaceId(2) },
  ]);

  expect(workspaces.map(({ root, label }) => ({ root, label }))).toEqual([
    { root: first, label: 'first' },
    { root: second, label: 'second' },
  ]);

  expect(defaultView.focusedWorkspaceId).toBe(workspaceId(2));
  expect(tabs).toHaveLength(2);
  expect(panes.map((pane) => pane.lifecycle)).toEqual(['running', 'running']);
});

it('removes the workspace when its only shell exits and keeps serving', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  server.writeToPane('exit\n');
  await waitFor(() => server.snapshot().workspaces.length === 0);

  expect(server.snapshot()).toMatchObject({
    tabs: [],
    panes: [],
    defaultView: { focusedWorkspaceId: undefined },
  });

  const answer = await createWorkspace(socketPath, directory, 'again');

  expect(answer.type).toBe('workspaceDone');
  expect(server.snapshot().workspaces.map((workspace) => workspace.label)).toEqual(['again']);
  expect(server.snapshot().panes.map((pane) => pane.lifecycle)).toEqual(['running']);
});

it.each([
  { type: 'workspaceFocus', workspaceId: workspaceId(9) },
  { type: 'workspaceRename', workspaceId: workspaceId(9), label: 'renamed' },
  { type: 'workspaceClose', workspaceId: workspaceId(9) },
] as const)(
  'answers $type for an unknown workspace with a failure and changes nothing',
  async (request) => {
    const directory = await temporaryDirectory();
    const { server, socketPath } = await startServer(directory);
    const before = server.snapshot();
    const client = await connectCli(socketPath);

    client.send(request);

    expect(await nextOfType(client, 'workspaceFailed')).toEqual({
      type: 'workspaceFailed',
      reason: 'unknownWorkspace',
      message: undefined,
    });

    expect(server.snapshot()).toEqual(before);
  },
);

it('focuses, renames, and closes a workspace and answers with its id', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  await createWorkspace(socketPath, directory, 'second');

  const client = await connectCli(socketPath);

  client.send({ type: 'workspaceFocus', workspaceId: workspaceId(1) });

  expect(await nextOfType(client, 'workspaceDone')).toEqual({
    type: 'workspaceDone',
    workspaceId: workspaceId(1),
  });

  expect(server.snapshot().defaultView.focusedWorkspaceId).toBe(workspaceId(1));

  client.send({ type: 'workspaceRename', workspaceId: workspaceId(1), label: 'renamed' });
  await nextOfType(client, 'workspaceDone');
  expect(server.snapshot().workspaces[0]?.label).toBe('renamed');

  client.send({ type: 'workspaceClose', workspaceId: workspaceId(1) });
  await nextOfType(client, 'workspaceDone');
  await waitFor(() => server.snapshot().panes.length === 1);

  expect(server.snapshot().workspaces.map((workspace) => workspace.id)).toEqual([workspaceId(2)]);
  expect(server.snapshot().defaultView.focusedWorkspaceId).toBe(workspaceId(2));
});

const readRecentOf = async (cli: TestClient, pane: PaneId) => {
  cli.send(readRecent(pane));

  return cli.nextPaneRows();
};

it('sends rows only for the focused workspace and the other screen after workspaceFocus', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);

  await createWorkspace(socketPath, directory, 'second');

  const cli = await connectCli(socketPath);

  cli.send({ type: 'paneSend', paneId: paneId(1), text: "printf 'hidden-%s\\n' marker\n" });
  await nextOfType(cli, 'paneSent');

  const terminal = await attachTerminal(socketPath, 100);

  server.writeToPane("printf 'visible-%s\\n' marker\n");
  await waitFor(() => server.paneText()?.includes('visible-marker') === true);

  const rows = new Map<number, string>();

  await receiveText(terminal, rows, 'visible-marker');

  const deadline = performance.now() + 5000;
  let hidden = await readRecentOf(cli, paneId(1));

  while (!linesOf(hidden).join('\n').includes('hidden-marker') && performance.now() < deadline) {
    await Bun.sleep(20);
    hidden = await readRecentOf(cli, paneId(1));
  }

  expect(linesOf(hidden).join('\n')).toContain('hidden-marker');
  expect(terminal.updates.every((update) => update.pane === 2)).toBe(true);

  const updatesBefore = terminal.updates.length;

  cli.send({ type: 'workspaceFocus', workspaceId: workspaceId(1) });
  await nextOfType(cli, 'workspaceDone');

  const shown = new Map<number, string>();

  for (;;) {
    const update = await terminal.nextUpdate();

    if (update.pane === 1) {
      applyRows(shown, update);

      if ([...shown.values()].some((row) => row.includes('hidden-marker'))) {
        break;
      }
    }
  }

  expect(terminal.updates.length).toBeGreaterThan(updatesBefore);
});

it('sends rows for every pane of the active tab after a split', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);

  await useLegacyLayout(socketPath);

  const cli = await connectCli(socketPath);
  const terminal = await attachTerminal(socketPath, 100);

  cli.send({ type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined });

  expect(await nextOfType(cli, 'paneDone')).toEqual({ type: 'paneDone', paneId: paneId(2) });

  cli.send({ type: 'paneSend', paneId: paneId(1), text: "printf 'left-%s\\n' marker\n" });
  cli.send({ type: 'paneSend', paneId: paneId(2), text: "printf 'right-%s\\n' marker\n" });

  const seen = new Set<number>();

  while (seen.size < 2) {
    seen.add((await terminal.nextUpdate()).pane);
  }

  expect(seen).toEqual(new Set([1, 2]));
});

const receiveShownText = async (
  client: TestClient,
  rows: Map<number, string>,
  text: string,
): Promise<void> => {
  while (![...rows.values()].some((row) => row.includes(text))) {
    const update = await client.nextUpdate();

    client.send({ type: 'ack', paneId: paneId(update.pane), sequence: update.sequence });

    if (update.pane === 1) {
      applyRows(rows, update);
    }
  }
};

it('sends no rows for a hidden pane while its tab is zoomed and its current screen after unzoom', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);

  await useLegacyLayout(socketPath);

  const cli = await connectCli(socketPath);
  const terminal = await attachTerminal(socketPath, 100);

  cli.send({ type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined });
  await nextOfType(cli, 'paneDone');
  cli.send({ type: 'paneZoom', paneId: paneId(1) });
  await nextOfType(cli, 'paneDone');

  const visibleRows = new Map<number, string>();

  cli.send({ type: 'paneSend', paneId: paneId(1), text: "printf 'shown-%s\\n' one\n" });
  await receiveShownText(terminal, visibleRows, 'shown-one');

  const updatesBefore = terminal.updates.length;

  cli.send({ type: 'paneSend', paneId: paneId(2), text: "printf 'hidden-%s\\n' marker\n" });

  for (;;) {
    cli.send(readRecent(paneId(2)));

    const read = await cli.nextPaneRows();

    if (linesOf(read).join('\n').includes('hidden-marker')) {
      break;
    }
  }

  cli.send({ type: 'paneSend', paneId: paneId(1), text: "printf 'shown-%s\\n' two\n" });
  await receiveShownText(terminal, visibleRows, 'shown-two');

  const whileZoomed = terminal.updates.slice(updatesBefore).map((update) => update.pane);

  expect(whileZoomed.length).toBeGreaterThan(0);
  expect(whileZoomed.filter((pane) => pane !== 1)).toEqual([]);

  cli.send({ type: 'paneZoom', paneId: paneId(1) });
  await nextOfType(cli, 'paneDone');

  const hiddenRows = new Map<number, string>();

  while (![...hiddenRows.values()].some((row) => row.includes('hidden-marker'))) {
    const update = await terminal.nextUpdate();

    terminal.send({ type: 'ack', paneId: paneId(update.pane), sequence: update.sequence });

    if (update.pane === 2) {
      applyRows(hiddenRows, update);
    }
  }
});

it('answers workspaceCreate with a failure and keeps no workspace when the shell cannot start', async () => {
  const directory = await temporaryDirectory();

  const { server, socketPath } = await startEmptyServer(
    directory,
    join(directory, 'missing-shell'),
  );

  const answer = await createWorkspace(socketPath, directory, 'broken');

  expect(answer).toMatchObject({ type: 'workspaceFailed', reason: 'paneFailedToStart' });
  expect(server.snapshot()).toMatchObject({ workspaces: [], tabs: [], panes: [] });
  expect(existsSync(socketPath)).toBe(true);
});

it('keeps the existing pane at its full size when the split pane fails to start', async () => {
  const directory = await temporaryDirectory();
  const root = join(directory, 'root');

  await mkdir(root);

  const { server, socketPath } = await startEmptyServer(directory);

  await createWorkspace(socketPath, root, 'root');

  await useLegacyLayout(socketPath);

  const before = server.snapshot().panes[0]?.size ?? { columns: 0, rows: 0 };

  await rm(root, { recursive: true });

  const cli = await connectCli(socketPath);

  cli.send({ type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined });

  expect(await nextOfType(cli, 'paneFailed')).toMatchObject({ reason: 'paneFailedToStart' });
  expect(server.snapshot().panes.map((pane) => pane.size)).toEqual([before]);

  server.writeToPane('stty size\n');
  await waitFor(() => server.paneText()?.includes(`${before.rows} ${before.columns}`) === true);
});
