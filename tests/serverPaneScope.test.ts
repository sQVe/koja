import { expect, it, onTestFinished, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { spawnPane } from '../src/server/pane.ts';
import * as scope from '../src/server/scope.ts';
import type { Server } from '../src/server/server.ts';
import {
  temporaryDirectory,
  waitFor,
  processesRunning,
  processExists,
  startServer,
  testIdentity,
  logLinesOf,
} from './serverHarness.ts';

const scopesAvailable = scope.scopeAvailable(process.env);

const startDetachedJob = async (server: Server): Promise<string> => {
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  server.writeToPane(`setsid sh -c "trap '' HUP; exec ${command}" &\n`);
  await waitFor(() => processesRunning(command).length > 0);

  return command;
};

it.skipIf(!scopesAvailable)(
  'ends a pane job that called setsid within the bounded wait',
  async () => {
    const directory = await temporaryDirectory();
    const { server } = await startServer(directory);
    const command = await startDetachedJob(server);
    const started = performance.now();

    server.stop();
    await server.stopped;

    expect(performance.now() - started).toBeLessThan(3000);
    await waitFor(() => processesRunning(command).length === 0, 1000);
  },
);

it.skipIf(!scopesAvailable)('runs a shell whose path holds a dollar sign', async () => {
  const directory = await temporaryDirectory();
  const shell = join(directory, 'sh$$');

  await symlink('/bin/sh', shell);

  const { server } = await startServer(directory, shell);

  server.writeToPane('echo koja-$((6 * 7))\n');
  await waitFor(() => server.paneText()?.includes('koja-42') === true);
});

it('starts the pane and ends its session when no user scope is available', async () => {
  const probe = spyOn(scope, 'scopeAvailable').mockReturnValue(false);

  onTestFinished(() => {
    probe.mockRestore();
  });

  const directory = await temporaryDirectory();
  const { server, logPath } = await startServer(directory);
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  server.writeToPane(`${command}\n`);
  await waitFor(() => processesRunning(command).length > 0);

  server.stop();
  await server.stopped;

  await waitFor(() => processesRunning(command).length === 0, 1000);

  expect(logLinesOf(logPath).some((line) => line.message.includes('No systemd user scope'))).toBe(
    true,
  );
});

it.skipIf(!scopesAvailable)('ends the pane scope when the pane is disposed', async () => {
  const result = spawnPane({
    generation: 1,
    size: { columns: 80, rows: 24 },
    environment: { ...process.env, SHELL: '/bin/sh' },
    directory: tmpdir(),
    identity: testIdentity,
    useScope: true,
    onOutput: () => undefined,
    onRenumbered: () => undefined,
    onBell: () => undefined,
    onClipboard: () => undefined,
    onFailed: () => undefined,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const { pane } = result;
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  onTestFinished(() => {
    for (const name of processesRunning(command)) {
      process.kill(Number(name), 'SIGKILL');
    }
  });

  pane.write(new TextEncoder().encode(`setsid sh -c "trap '' HUP; exec ${command}" &\n`));
  await waitFor(() => processesRunning(command).length > 0);

  pane[Symbol.dispose]();

  await waitFor(() => processesRunning(command).length === 0, 2000);
});

it.skipIf(!scopesAvailable)(
  'reports cleanupFailed and still ends the shell when a scope signal fails',
  async () => {
    const signal = spyOn(scope, 'signalScope').mockResolvedValue({
      ok: false,
      message: 'Cannot send SIGHUP to scope test.scope',
    });

    onTestFinished(() => {
      signal.mockRestore();
    });

    const directory = await temporaryDirectory();
    const { server, logPath } = await startServer(directory);
    const command = `sleep 1000.${process.pid}${Date.now()}`;

    server.writeToPane(`exec ${command}\n`);
    await waitFor(() => processesRunning(command).length > 0);

    const [shellProcess] = processesRunning(command);

    server.stop();

    const stopped = await server.stopped;

    expect(stopped).toMatchObject({ ok: false, reason: 'cleanupFailed' });
    expect(processExists(Number(shellProcess))).toBe(false);

    expect(
      logLinesOf(logPath).some((line) => String(line.fields.error).includes('Cannot send SIGHUP')),
    ).toBe(true);
  },
);

it.skipIf(!scopesAvailable)(
  'stops within a bound and reports cleanupFailed when systemctl stalls',
  async () => {
    const directory = await temporaryDirectory();
    const fakeDirectory = join(directory, 'fake-bin');

    await mkdir(fakeDirectory);

    const { server, logPath } = await startServer(
      directory,
      '/bin/sh',
      `${fakeDirectory}:${process.env.PATH}`,
    );

    const command = `sleep 1000.${process.pid}${Date.now()}`;

    server.writeToPane(`exec ${command}\n`);
    await waitFor(() => processesRunning(command).length > 0);

    const [shellProcess] = processesRunning(command);

    // The fake goes on PATH only after the pane started in its scope, so only stop meets it.
    await Bun.write(join(fakeDirectory, 'systemctl'), '#!/bin/sh\nexec sleep 30\n');
    await chmod(join(fakeDirectory, 'systemctl'), 0o755);

    const started = performance.now();

    server.stop();

    const stopped = await server.stopped;

    expect(performance.now() - started).toBeLessThan(4000);
    expect(stopped).toMatchObject({ ok: false, reason: 'cleanupFailed' });
    expect(processExists(Number(shellProcess))).toBe(false);
    expect(logLinesOf(logPath).some((line) => line.level === 'error')).toBe(true);
  },
);

it.skipIf(!scopesAvailable)(
  'signals a pane scope that systemd registers only after stop begins',
  async () => {
    const directory = await temporaryDirectory();
    const fakeDirectory = join(directory, 'fake-bin');
    const readyPath = join(directory, 'ready');
    const armedPath = join(directory, 'armed');
    const hangupPath = join(directory, 'hangup');
    const queriedPath = join(directory, 'queried');
    const realSystemctl = Bun.which('systemctl');

    await mkdir(fakeDirectory);

    // Until the ready file exists, the fake answers as systemd does for a scope it has not
    // registered yet: kill fails and is-active reports an unknown unit.
    const fake = [
      '#!/bin/sh',
      `if [ ! -e '${readyPath}' ]; then`,
      '  case "$*" in',
      `    *is-active*) touch '${queriedPath}'; exit 4 ;;`,
      '    *kill*) exit 1 ;;',
      '  esac',
      'fi',
      `exec '${realSystemctl}' "$@"`,
      '',
    ].join('\n');

    await Bun.write(join(fakeDirectory, 'systemctl'), fake);
    await chmod(join(fakeDirectory, 'systemctl'), 0o755);

    const result = spawnPane({
      generation: 1,
      size: { columns: 80, rows: 24 },
      environment: {
        ...process.env,
        SHELL: '/bin/sh',
        PATH: `${fakeDirectory}:${process.env.PATH}`,
      },
      directory,
      identity: testIdentity,
      useScope: true,
      onOutput: () => undefined,
      onRenumbered: () => undefined,
      onBell: () => undefined,
      onClipboard: () => undefined,
      onFailed: () => undefined,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    const { pane } = result;

    onTestFinished(() => {
      pane[Symbol.dispose]();
    });

    const script = `trap 'touch ${hangupPath}' HUP; touch ${armedPath}; while :; do sleep 0.05; done\n`;

    pane.write(new TextEncoder().encode(script));
    await waitFor(() => existsSync(armedPath));

    const stopping = pane.stop();

    await waitFor(() => existsSync(queriedPath));
    await Bun.write(readyPath, '');

    expect(await stopping).toEqual([]);
    expect(existsSync(hangupPath)).toBe(true);
  },
);

it.skipIf(!scopesAvailable)(
  'reports cleanupFailed and still ends the shell when the scope never registers',
  async () => {
    const directory = await temporaryDirectory();
    const fakeDirectory = join(directory, 'fake-bin');
    const armedPath = join(directory, 'armed');

    await mkdir(fakeDirectory);

    const fake = [
      '#!/bin/sh',
      'case "$*" in',
      '  *is-active*) exit 4 ;;',
      '  *kill*) exit 1 ;;',
      'esac',
      '',
    ].join('\n');

    await Bun.write(join(fakeDirectory, 'systemctl'), fake);
    await chmod(join(fakeDirectory, 'systemctl'), 0o755);

    const result = spawnPane({
      generation: 1,
      size: { columns: 80, rows: 24 },
      environment: {
        ...process.env,
        SHELL: '/bin/sh',
        PATH: `${fakeDirectory}:${process.env.PATH}`,
      },
      directory,
      identity: testIdentity,
      useScope: true,
      onOutput: () => undefined,
      onRenumbered: () => undefined,
      onBell: () => undefined,
      onClipboard: () => undefined,
      onFailed: () => undefined,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    const { pane } = result;

    onTestFinished(() => {
      pane[Symbol.dispose]();
    });

    pane.write(new TextEncoder().encode(`touch ${armedPath}; while :; do sleep 0.05; done\n`));
    await waitFor(() => existsSync(armedPath));

    const failures = await pane.stop();

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('did not register');
    expect(await pane.exited).not.toBe(0);
  },
);

it.skipIf(!scopesAvailable)(
  'reports cleanupFailed and signals the shell when a stalled query is followed by unknown unit answers',
  async () => {
    const directory = await temporaryDirectory();
    const fakeDirectory = join(directory, 'fake-bin');
    const armedPath = join(directory, 'armed');
    const hangupPath = join(directory, 'hangup');
    const queriedPath = join(directory, 'queried');

    await mkdir(fakeDirectory);

    const fake = [
      '#!/bin/sh',
      'case "$*" in',
      `  *is-active*) if [ ! -e '${queriedPath}' ]; then touch '${queriedPath}'; exec sleep 2; fi; exit 4 ;;`,
      '  *kill*) exit 1 ;;',
      'esac',
      '',
    ].join('\n');

    await Bun.write(join(fakeDirectory, 'systemctl'), fake);
    await chmod(join(fakeDirectory, 'systemctl'), 0o755);

    const result = spawnPane({
      generation: 1,
      size: { columns: 80, rows: 24 },
      environment: {
        ...process.env,
        SHELL: '/bin/sh',
        PATH: `${fakeDirectory}:${process.env.PATH}`,
      },
      directory,
      identity: testIdentity,
      useScope: true,
      onOutput: () => undefined,
      onRenumbered: () => undefined,
      onBell: () => undefined,
      onClipboard: () => undefined,
      onFailed: () => undefined,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    const { pane } = result;

    onTestFinished(() => {
      pane[Symbol.dispose]();
    });

    const script = `trap 'touch ${hangupPath}' HUP; touch ${armedPath}; while :; do sleep 0.05; done\n`;

    pane.write(new TextEncoder().encode(script));
    await waitFor(() => existsSync(armedPath));

    const failures = await pane.stop();

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('did not register');
    expect(existsSync(hangupPath)).toBe(true);
    expect(await pane.exited).not.toBe(0);
  },
);
