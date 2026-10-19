import { expect, it, onTestFinished } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createFrameDecoder,
  encodeControl,
  encodeFrame,
  FrameKind,
  parseControl,
} from '../src/protocol/protocol.ts';
import type { ControlMessage } from '../src/protocol/protocol.ts';

const runKoja = async (...commandArguments: string[]) => {
  const child = Bun.spawn([process.execPath, 'src/index.ts', ...commandArguments], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();

  return { code: await child.exited, stdout, stderr };
};

const listen = async (respond: (message: ControlMessage) => ControlMessage[] | undefined) => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-detach-cli-'));
  const socketPath = join(directory, 'koja.sock');
  const decoder = createFrameDecoder();

  const listener = Bun.listen({
    unix: socketPath,
    socket: {
      data: (socket, bytes) => {
        const decoded = decoder.push(bytes);

        for (const frame of decoded.ok ? decoded.frames : []) {
          const parsed = parseControl(frame.payload);

          const responses = parsed.ok ? respond(parsed.message) : undefined;

          if (responses === undefined) {
            socket.end();
          }

          for (const message of responses ?? []) {
            socket.write(encodeFrame(FrameKind.control, encodeControl(message)));
          }
        }
      },
    },
  });

  onTestFinished(async () => {
    listener.stop(true);
    await rm(directory, { recursive: true, force: true });
  });

  return socketPath;
};

const welcome: ControlMessage = { type: 'welcome' };

it('prints a JSON failure and exits 1 when no server listens', async () => {
  const result = await runKoja('detach', '--json', '--socket', '/nonexistent/koja.sock');

  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({ detached: false, reason: 'noServer' });
  expect(result.stderr).toContain('No server is listening');
});

it('prints a JSON failure and exits 1 when the server refuses the version', async () => {
  const socketPath = await listen((message) =>
    message.type === 'hello'
      ? [
          {
            type: 'refused',
            client: message.version,
            server: { version: 'other', ghostty: 'other-ghostty' },
          },
        ]
      : [],
  );

  const result = await runKoja('detach', '--json', '--socket', socketPath);

  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({ detached: false, reason: 'refused' });
  expect(result.stderr).toContain('cannot connect to server');
});

it('prints a JSON failure and exits 1 when the server drops the connection', async () => {
  const socketPath = await listen(() => undefined);
  const result = await runKoja('detach', '--json', '--socket', socketPath);

  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({ detached: false, reason: 'connectionFailed' });
  expect(result.stderr).toContain('did not complete the detach');
});

it('prints a JSON failure when no client is attached', async () => {
  const socketPath = await listen((message) => {
    if (message.type === 'hello') {
      return [welcome];
    }

    return message.type === 'detach'
      ? [{ type: 'detachResult', result: { ok: false, reason: 'noClient' } }]
      : [];
  });

  const result = await runKoja('detach', '--json', '--socket', socketPath);

  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({ detached: false, reason: 'noClient' });
  expect(result.stderr).toContain('No client is attached');
});

it('prints JSON success and exits 0 when a client detaches', async () => {
  const socketPath = await listen((message) => {
    if (message.type === 'hello') {
      return [welcome];
    }

    return message.type === 'detach' ? [{ type: 'detachResult', result: { ok: true } }] : [];
  });

  const result = await runKoja('detach', '--json', '--socket', socketPath);

  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ detached: true });
});
