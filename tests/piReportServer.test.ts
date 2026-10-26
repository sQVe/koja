import { expect, it, onTestFinished } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { paneId } from '../src/ids.ts';
import type { PaneId } from '../src/ids.ts';
import type { ControlMessage } from '../src/protocol/protocol.ts';
import { readStat } from '../src/server/processGroups.ts';
import { runServer } from '../src/server/server.ts';
import type { Server } from '../src/server/server.ts';
import type { PiReport } from '../src/store/store.ts';
import {
  build,
  connectCli,
  createWorkspace,
  nextOfType,
  openLog,
  startServer,
  temporaryDirectory,
  waitFor,
} from './serverHarness.ts';
import type { TestClient } from './serverHarness.ts';

type PiStatus = Extract<ControlMessage, { type: 'piStatusReply' }>['pi'];

const reportFor = (processId: number): PiReport => ({
  processId,
  piVersion: '1.4.0',
  sessionId: 'conversation',
  sessionFile: '/tmp/conversation.jsonl',
  leafId: 'leaf',
  provider: 'provider',
  model: 'model',
  thinkingLevel: 'high',
  ownership: 'interactive',
});

const identityOf = async (client: TestClient, target: PaneId) => {
  client.send({ type: 'paneProcessInfo', paneId: target });

  const { shellPid } = await nextOfType(client, 'paneProcessInfoReply');

  const passOf = (): string | undefined =>
    readFileSync(`/proc/${shellPid}/environ`, 'utf8')
      .split('\0')
      .find((entry) => entry.startsWith('KOJA_REPORT_TOKEN='))
      ?.split('=')[1];

  // Until the forked server execs the shell, its environment is still the server's.
  await waitFor(() => passOf() !== undefined);

  const pass = passOf();

  expect(pass).toMatch(/^[0-9a-f]{64}$/);

  return { processId: shellPid, pass: pass! };
};

const statusOf = async (client: TestClient, target: PaneId): Promise<PiStatus> => {
  client.send({ type: 'piStatus', paneId: target });

  return (await nextOfType(client, 'piStatusReply')).pi;
};

const expectShellAnswers = async (
  server: Server,
  client: TestClient,
  target: PaneId,
): Promise<void> => {
  expect(server.snapshot().panes.find((pane) => pane.id === target)?.lifecycle).toBe('running');
  client.send({ type: 'paneFocus', paneId: target });
  await nextOfType(client, 'paneDone');

  const marker = crypto.randomUUID().slice(0, 8);

  server.writeToPane(`printf '%s%s\\n' shell '${marker}'\n`);
  await waitFor(() => server.paneText()?.includes(`shell${marker}`) === true);
};

const sendReport = async (client: TestClient, target: PaneId, pass: string, report: PiReport) => {
  client.send({ type: 'piReport', paneId: target, token: pass, report });

  return (await nextOfType(client, 'piReportResult')).result;
};

const recordShell = async (client: TestClient, target: PaneId) => {
  const identity = await identityOf(client, target);
  const report = reportFor(identity.processId);

  expect(await sendReport(client, target, identity.pass, report)).toEqual({
    ok: true,
    status: 'recorded',
  });

  const { processId: _processId, ...fields } = report;
  const expected = { state: 'reported' as const, ...fields };

  expect(await statusOf(client, target)).toEqual(expected);

  return { ...identity, report, expected };
};

it('refuses a wrong pass without ending the pane shell', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connectCli(socketPath);

  expect(await sendReport(client, paneId(1), '0'.repeat(64), reportFor(process.pid))).toEqual({
    ok: false,
    reason: 'unauthorized',
  });

  await expectShellAnswers(server, client, paneId(1));
  expect(await statusOf(client, paneId(1))).toBeNull();
});

it.each(['wrong pass', 'another pane pass', 'outside process', 'dead process'] as const)(
  'refuses %s and keeps the earlier record and shell',
  async (failure) => {
    const directory = await temporaryDirectory();
    const { server, socketPath } = await startServer(directory);
    const client = await connectCli(socketPath);
    const target = paneId(1);
    const recorded = await recordShell(client, target);
    let pass = recorded.pass;
    let processId = recorded.processId;
    let reason: 'unauthorized' | 'processNotInPane' = 'unauthorized';

    if (failure === 'wrong pass') {
      pass = '0'.repeat(64);
    }

    if (failure === 'another pane pass') {
      client.send({ type: 'paneSplit', paneId: target, direction: 'right', cwd: undefined });

      const split = await nextOfType(client, 'paneDone');

      pass = (await identityOf(client, split.paneId)).pass;
      expect(pass).not.toBe(recorded.pass);
    }

    if (failure === 'outside process') {
      processId = process.pid;
      reason = 'processNotInPane';
    }

    if (failure === 'dead process') {
      const child = Bun.spawn(['/bin/true']);

      await child.exited;
      processId = child.pid;
      reason = 'processNotInPane';
      expect(existsSync(`/proc/${processId}`)).toBe(false);
    }

    const changed = { ...reportFor(processId), sessionId: 'must-not-replace' };

    expect(await sendReport(client, target, pass, changed)).toEqual({ ok: false, reason });
    await expectShellAnswers(server, client, target);
    expect(await statusOf(client, target)).toEqual(recorded.expected);
  },
);

it('records a process inside the pane and hides identity after its conversation changes', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const client = await connectCli(socketPath);
  const target = paneId(1);
  const recorded = await recordShell(client, target);

  expect(await sendReport(client, target, recorded.pass, recorded.report)).toEqual({
    ok: true,
    status: 'unchanged',
  });

  expect(await statusOf(client, target)).toEqual(recorded.expected);

  const changed = { ...recorded.report, leafId: 'other-leaf' };

  expect(await sendReport(client, target, recorded.pass, changed)).toEqual({
    ok: true,
    status: 'changed',
  });

  expect(await statusOf(client, target)).toEqual({ state: 'changed' });
});

it('hides a record once its process exits while the shell keeps running', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connectCli(socketPath);
  const target = paneId(1);
  const identity = await identityOf(client, target);
  const processFile = join(directory, 'child.pid');

  server.writeToPane(`sleep 300 & printf '%s' "$!" > '${processFile}'\n`);
  await waitFor(() => existsSync(processFile) && readFileSync(processFile, 'utf8').length > 0);

  const processId = Number(readFileSync(processFile, 'utf8'));

  expect(await sendReport(client, target, identity.pass, reportFor(processId))).toEqual({
    ok: true,
    status: 'recorded',
  });

  expect(await statusOf(client, target)).toMatchObject({ state: 'reported' });

  process.kill(processId, 'SIGTERM');

  // dash reaps a background child only when it reads its next command, so the child can stay a
  // zombie until then.
  await waitFor(() => {
    const stat = readStat(String(processId));

    return stat === undefined || stat.state === 'Z';
  });

  expect(await statusOf(client, target)).toBeNull();
  await expectShellAnswers(server, client, target);
});

const startSavedServer = async (directory: string) => {
  const socketPath = join(directory, 'run', 'koja.sock');

  const result = await runServer({
    socketPath,
    version: build,
    log: openLog(join(directory, 'server.log')),
    environment: { ...process.env, SHELL: '/bin/sh' },
    binaryPath: process.execPath,
    sessionPathFor: () => join(directory, 'session.json'),
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const { server } = result;

  onTestFinished(async () => {
    server.stop();
    await server.stopped;
  });

  return { server, client: await connectCli(socketPath), socketPath };
};

it('refuses the old pass after restoring the pane with a new shell generation', async () => {
  const directory = await temporaryDirectory();
  const first = await startSavedServer(directory);

  await createWorkspace(first.socketPath, directory, 'test');
  first.client.send({ type: 'paneSplit', paneId: paneId(1), direction: 'right', cwd: undefined });

  const { paneId: target } = await nextOfType(first.client, 'paneDone');

  first.client.send({ type: 'paneClose', paneId: paneId(1) });
  await nextOfType(first.client, 'paneDone');

  const recorded = await recordShell(first.client, target);
  const generation = first.server.snapshot().panes[0]!.generation;

  first.server.stop();
  expect(await first.server.stopped).toEqual({ ok: true });

  const restored = await startSavedServer(directory);
  const identity = await identityOf(restored.client, target);

  expect(restored.server.snapshot().panes[0]!.generation).not.toBe(generation);
  expect(identity.processId).not.toBe(recorded.processId);
  expect(identity.pass).not.toBe(recorded.pass);
  expect(await statusOf(restored.client, target)).toBeNull();

  expect(
    await sendReport(restored.client, target, recorded.pass, reportFor(identity.processId)),
  ).toEqual({ ok: false, reason: 'unauthorized' });

  await expectShellAnswers(restored.server, restored.client, target);
  expect(await statusOf(restored.client, target)).toBeNull();
});

it('answers status for an unknown pane with unknownPane', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const client = await connectCli(socketPath);

  client.send({ type: 'piStatus', paneId: paneId(999) });

  expect(await nextOfType(client, 'paneFailed')).toEqual({
    type: 'paneFailed',
    reason: 'unknownPane',
    message: undefined,
  });
});
