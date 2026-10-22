import { expect, it, onTestFinished, spyOn } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { chmod, mkdir, rename, symlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { BuildVersion } from '../src/protocol/messages.ts';
import * as processGroups from '../src/server/processGroups.ts';
import { runServer } from '../src/server/server.ts';
import type { Server } from '../src/server/server.ts';
import { claimSocketPath } from '../src/server/socketPath.ts';
import {
  build,
  temporaryDirectory,
  waitFor,
  processesRunning,
  processExists,
  openLog,
  connect,
  createWorkspace,
  startServer,
  logLinesOf,
} from './serverHarness.ts';

const isRoot = process.getuid?.() === 0;

const serverModule = join(import.meta.dir, '..', 'src', 'server', 'server.ts');

const logModule = join(import.meta.dir, '..', 'src', 'server', 'log.ts');

// Runs a server in its own process, so the test can signal it. Lines on stdin go to the pane.
const serverScript = (socketPath: string): string => `
  import { createLog, logPathFor } from ${JSON.stringify(logModule)};
  import { runServer } from ${JSON.stringify(serverModule)};

  const created = createLog(logPathFor(process.env.XDG_STATE_HOME, '/nonexistent', ${JSON.stringify(socketPath)}), Date.now);

  if (!created.ok) {
    console.error(created.message);
    process.exit(1);
  }

  const result = await runServer({
    socketPath: ${JSON.stringify(socketPath)},
    version: ${JSON.stringify(build)},
    log: created.log,
    environment: { ...process.env, SHELL: '/bin/sh' },
    binaryPath: process.execPath,
  });

  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }

  process.stdin.on('data', (bytes) => result.server.writeToPane(bytes.toString()));
  console.log('listening');
  await result.server.stopped;
  process.exit(0);
`;

const readUntil = async (stream: ReadableStream<Uint8Array>, text: string): Promise<void> => {
  const decoder = new TextDecoder();
  let read = '';

  for await (const chunk of stream) {
    read += decoder.decode(chunk);

    if (read.includes(text)) {
      return;
    }
  }

  throw new Error(`The output ended before ${text}: ${read}`);
};

const startServerProcess = async (directory: string) => {
  const socketPath = join(directory, 'run', 'koja.sock');

  const child = Bun.spawn([process.execPath, '--eval', serverScript(socketPath)], {
    cwd: directory,
    env: { ...process.env, XDG_STATE_HOME: join(directory, 'state') },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'inherit',
  });

  onTestFinished(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }

    await child.exited;
  });

  await readUntil(child.stdout, 'listening');

  return { child, socketPath };
};

it('removes the socket it bound even when its symlink route changes', async () => {
  const directory = await temporaryDirectory();
  const real = join(directory, 'real');
  const link = join(directory, 'link');
  await mkdir(real, { mode: 0o700 });
  await mkdir(join(directory, 'other'), { mode: 0o700 });
  await symlink(real, link);

  const result = await runServer({
    socketPath: join(link, 'koja', 'koja.sock'),
    version: build,
    log: openLog(join(directory, 'state', 'koja', 'server.log')),
    environment: { ...process.env, SHELL: '/bin/sh' },
    binaryPath: process.execPath,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  await symlink(join(directory, 'other'), join(directory, 'next'));
  await rename(join(directory, 'next'), link);
  result.server.stop();
  await result.server.stopped;

  expect(existsSync(join(real, 'koja', 'koja.sock'))).toBe(false);
});

it('creates the socket for its owner only, whatever the umask', async () => {
  const directory = await temporaryDirectory();
  const previous = process.umask(0);

  onTestFinished(() => {
    process.umask(previous);
  });

  const { socketPath } = await startServer(directory);

  process.umask(previous);

  expect(statSync(socketPath).mode & 0o777).toBe(0o600);
});

it('welcomes a client from the same build and removes the socket when it stops', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });

  expect(await client.nextMessage()).toEqual({ type: 'welcome' });

  server.stop();

  expect(await server.stopped).toEqual({ ok: true });
  expect(existsSync(socketPath)).toBe(false);
});

it('refuses a client from another build with both versions and closes the connection', async () => {
  const directory = await temporaryDirectory();
  const { socketPath } = await startServer(directory);
  const client = await connect(socketPath);
  const other: BuildVersion = { version: '1.2.4', ghostty: 'def456' };

  client.send({ type: 'hello', version: other, size: undefined });

  expect(await client.nextMessage()).toEqual({ type: 'refused', client: other, server: build });

  await client.closed;

  expect(client.messages).toEqual([{ type: 'refused', client: other, server: build }]);
});

it('parses what the shell writes to its PTY', async () => {
  const directory = await temporaryDirectory();
  const { server } = await startServer(directory);

  server.writeToPane('echo koja-$((6 * 7))\n');

  // The PTY echoes the command, and a shell without line editing prints its prompt before the
  // output, so look for text only the command's output holds.
  await waitFor(() => server.paneText()?.includes('koja-42') === true);
});

it('ends a pane job that ignores SIGHUP within the bounded wait and removes the socket', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  // A unique duration, so the test finds only its own sleep.
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  server.writeToPane(`trap '' HUP; ${command}\n`);
  await waitFor(() => processesRunning(command).length > 0);

  const started = performance.now();

  server.stop();
  await server.stopped;

  expect(performance.now() - started).toBeLessThan(3000);
  await waitFor(() => processesRunning(command).length === 0, 1000);
  expect(existsSync(socketPath)).toBe(false);
});

it('keeps running after SIGHUP and after the shell exits, and stops on SIGTERM', async () => {
  const directory = await temporaryDirectory();
  const { child, socketPath } = await startServerProcess(directory);

  child.kill('SIGHUP');
  expect((await createWorkspace(socketPath, directory, 'shell')).type).toBe('workspaceDone');

  await child.stdin.write('exit\n');
  await child.stdin.flush();

  const exitedEarly = await Promise.race([child.exited, Bun.sleep(500).then(() => 'running')]);

  expect(exitedEarly).toBe('running');
  expect(existsSync(socketPath)).toBe(true);

  child.kill('SIGTERM');

  expect(await child.exited).toBe(0);
  expect(existsSync(socketPath)).toBe(false);
});

it.each(['SIGTERM', 'SIGINT'] as const)('stops on %s and removes the socket', async (signal) => {
  const directory = await temporaryDirectory();
  const { child, socketPath } = await startServerProcess(directory);

  child.kill(signal);

  expect(await child.exited).toBe(0);
  expect(existsSync(socketPath)).toBe(false);
});

it('stops when a client sends stop', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath } = await startServer(directory);
  const client = await connect(socketPath);

  client.send({ type: 'hello', version: build, size: undefined });
  await client.nextMessage();
  client.send({ type: 'stop' });

  await server.stopped;
  await client.closed;

  expect(existsSync(socketPath)).toBe(false);
});

it('ends the pane, closes connections, and removes the socket when stopping the pane fails', async () => {
  const directory = await temporaryDirectory();
  const { server, socketPath, logPath } = await startServer(directory);
  const client = await connect(socketPath);
  // A unique duration, so the test finds only its own sleep.
  const command = `sleep 1000.${process.pid}${Date.now()}`;

  client.send({ type: 'hello', version: build, size: undefined });
  await client.nextMessage();
  server.writeToPane(`exec ${command}\n`);
  await waitFor(() => processesRunning(command).length > 0);

  const [shellProcess] = processesRunning(command);

  const scan = spyOn(processGroups, 'sessionGroups').mockImplementation(() => {
    throw new Error('No /proc here.');
  });

  onTestFinished(() => {
    scan.mockRestore();
  });

  server.stop();

  const stopped = await server.stopped;

  expect(processExists(Number(shellProcess))).toBe(false);
  await client.closed;
  expect(stopped).toMatchObject({ ok: false, reason: 'cleanupFailed' });
  expect(existsSync(socketPath)).toBe(false);
  expect(logLinesOf(logPath).some((line) => line.fields.error === 'No /proc here.')).toBe(true);
});

it('starts a new server on the socket path after the first one stops', async () => {
  const directory = await temporaryDirectory();
  const first = await startServer(directory);

  first.server.stop();
  await first.server.stopped;

  const second = await startServer(directory);
  const client = await connect(second.socketPath);

  client.send({ type: 'hello', version: build, size: undefined });

  expect(await client.nextMessage()).toEqual({ type: 'welcome' });
});

it.skipIf(isRoot)(
  'releases the lock and reports the failure when it cannot remove its socket',
  async () => {
    const directory = await temporaryDirectory();
    const { server, socketPath, logPath } = await startServer(directory);
    const socketDirectory = join(directory, 'run');

    await chmod(socketDirectory, 0o500);

    let stopped: Awaited<Server['stopped']>;

    try {
      server.stop();
      stopped = await server.stopped;
    } finally {
      await chmod(socketDirectory, 0o700);
    }

    // The socket is left behind, and the next claim removes it as stale.
    const claimed = await claimSocketPath(socketPath);

    if (claimed.ok) {
      claimed.release();
    }

    expect(stopped).toMatchObject({ ok: false, reason: 'cleanupFailed' });
    expect(logLinesOf(logPath).some((line) => line.level === 'error')).toBe(true);
    expect(claimed).toMatchObject({ ok: true, path: socketPath });
  },
);
