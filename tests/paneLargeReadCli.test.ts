import { expect, it, onTestFinished } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import packageJson from '../package.json' with { type: 'json' };
import { paneId } from '../src/ids.ts';
import { createFrameDecoder, encodeFrame, FrameKind } from '../src/protocol/frames.ts';
import { encodeControl } from '../src/protocol/messages.ts';
import { decodeRowUpdate, rowWords } from '../src/rows/rows.ts';
import { ghosttyCommit } from '../src/vt/vt.ts';
import { cliTestTimeoutMs, environmentFor, runCli } from './cliHarness.ts';
import { paneReadSchema, readJson, setup, waitForText } from './paneHarness.ts';

const connectLargeTerminal = async (
  socketPath: string,
  size: { columns: number; rows: number },
) => {
  const decoder = createFrameDecoder();
  const commit = ghosttyCommit();

  if (!commit.ok) {
    throw new Error(commit.detail);
  }

  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data: (connection, bytes) => {
        const decoded = decoder.push(bytes);

        for (const frame of decoded.ok ? decoded.frames : []) {
          const update =
            frame.kind === FrameKind.rowUpdate ? decodeRowUpdate(frame.payload) : undefined;

          if (update?.ok === true) {
            const { pane, sequence } = update.update;
            const ack = encodeControl({ type: 'ack', paneId: paneId(pane), sequence });

            connection.write(encodeFrame(FrameKind.control, ack));
          }
        }
      },
    },
  });

  onTestFinished(() => {
    socket.end();
  });

  const version = { version: packageJson.version, ghostty: commit.commit };
  const hello = encodeControl({ type: 'hello', version, size });

  socket.write(encodeFrame(FrameKind.control, hello));
};

it(
  'reads the whole visible screen of a pane too large for one reply',
  async () => {
    const { directory, koja, list, first } = await setup();
    const socketPath = join(directory, 'run', 'koja.sock');

    await connectLargeTerminal(socketPath, { columns: 340, rows: 131 });

    let pane = (await list())[0];

    for (let attempt = 0; attempt < 100 && (pane?.columns ?? 0) < 300; attempt += 1) {
      await Bun.sleep(100);
      pane = (await list())[0];
    }

    const columns = pane?.columns ?? 0;
    const rows = pane?.rows ?? 0;

    expect(columns).toBeGreaterThanOrEqual(300);
    expect(rowWords(columns) * 4 * rows).toBeGreaterThan(512 * 1024);

    const sent = await koja('pane', 'send', "seq 1 400 | sed 's/^/v/'; printf done\n");

    expect(sent.exitCode).toBe(0);
    await waitForText(koja, first, 'done');

    const full = await readJson(koja, first, '--source', 'visible');

    expect(full.lines).toHaveLength(rows);
    expect(full.lines.at(-1)).toBe('done');
    expect(full.lines.at(-2)).toBe('v400');
    expect(full.to).toBe((full.from ?? 0) + rows - 1);

    const counted = await readJson(koja, first, '--source', 'visible', '--lines', '120');

    expect(counted.lines).toEqual(full.lines.slice(-120));
  },
  cliTestTimeoutMs,
);

it(
  'reads every row of a visible screen taller than one reply, and clamps a count to 1000',
  async () => {
    const { directory, koja, list, first } = await setup();

    await connectLargeTerminal(join(directory, 'run', 'koja.sock'), { columns: 100, rows: 1006 });

    let pane = (await list())[0];

    for (let attempt = 0; attempt < 100 && (pane?.rows ?? 0) < 1005; attempt += 1) {
      await Bun.sleep(100);
      pane = (await list())[0];
    }

    expect(pane?.rows).toBe(1005);

    const sent = await koja('pane', 'send', "printf '\\033[2J\\033[H'; seq 1 1004; printf done\n");

    expect(sent.exitCode).toBe(0);
    await waitForText(koja, first, 'done');

    const full = await readJson(koja, first, '--source', 'visible');

    expect(full.lines.slice(0, 3)).toEqual(['1', '2', '3']);
    expect(full.lines.at(-1)).toBe('done');
    expect(full.to).toBe((full.from ?? 0) + 1004);

    const counted = await readJson(koja, first, '--source', 'visible', '--lines', '2000');

    expect(counted.lines).toHaveLength(1000);
    expect(counted.lines.at(-1)).toBe('done');
  },
  cliTestTimeoutMs,
);

// Forwards a CLI connection to the server and holds the first rows reply until released, so the
// test can change the pane between the first page and the next request.
// A socket write can take fewer bytes than given. The rest waits for the drain.
const pendingWrites = new WeakMap<object, Uint8Array>();

const send = (socket: { write: (bytes: Uint8Array) => number }, bytes: Uint8Array): void => {
  const queued = pendingWrites.get(socket);

  if (queued !== undefined) {
    pendingWrites.set(socket, Uint8Array.from([...queued, ...bytes]));

    return;
  }

  const written = socket.write(bytes);

  if (written < bytes.length) {
    pendingWrites.set(socket, bytes.subarray(written));
  }
};

const wait = (file: string) => `while [ ! -f ${file} ]; do sleep 0.05; done`;

const holdFirstPage = async (upstreamPath: string, proxyPath: string) => {
  const held = Promise.withResolvers<undefined>();
  const gate = Promise.withResolvers<undefined>();
  let seen = false;

  const listener = Bun.listen<{
    upstream: Promise<Awaited<ReturnType<typeof Bun.connect>>>;
  }>({
    unix: proxyPath,
    socket: {
      open: (client) => {
        const decoder = createFrameDecoder();

        client.data = {
          upstream: Bun.connect({
            unix: upstreamPath,
            socket: {
              data: async (_upstream, bytes) => {
                const decoded = decoder.push(bytes);

                for (const frame of decoded.ok ? decoded.frames : []) {
                  if (frame.kind === FrameKind.paneRows && !seen) {
                    seen = true;
                    held.resolve(undefined);
                    await gate.promise;
                  }

                  send(client, encodeFrame(frame.kind, frame.payload));
                }
              },
              close: () => {
                client.end();
              },
            },
          }),
        };
      },
      drain: (client) => {
        const queued = pendingWrites.get(client);

        if (queued === undefined) {
          return;
        }

        pendingWrites.delete(client);
        send(client, queued);
      },
      data: async (client, bytes) => {
        (await client.data.upstream).write(bytes);
      },
      close: async (client) => {
        (await client.data.upstream).end();
      },
    },
  });

  onTestFinished(() => {
    listener.stop(true);
  });

  return {
    held: held.promise,
    release: () => {
      gate.resolve(undefined);
    },
  };
};

// Starts a visible read of a pane too large for one reply through a proxy that holds its first
// part, runs the pane's switching steps, and returns the finished read.
const readAcrossSwitch = async (switchSteps: string[], waitFor: string) => {
  const { directory, koja, list, first } = await setup();
  const socketPath = join(directory, 'run', 'koja.sock');

  await connectLargeTerminal(socketPath, { columns: 340, rows: 131 });

  let pane = (await list())[0];

  for (let attempt = 0; attempt < 100 && (pane?.columns ?? 0) < 300; attempt += 1) {
    await Bun.sleep(100);
    pane = (await list())[0];
  }

  const script = [
    "printf '\\033[?1049h\\033[H'",
    'seq 1 300',
    "printf 'ready\\n'",
    wait('switch'),
    ...switchSteps,
  ].join('; ');

  expect((await koja('pane', 'send', `${script}\n`)).exitCode).toBe(0);
  await waitForText(koja, first, 'ready');

  const proxyPath = join(directory, 'proxy.sock');
  const proxy = await holdFirstPage(socketPath, proxyPath);

  const read = runCli(
    ['pane', 'read', first, '--source', 'visible', '--json', '--socket', proxyPath],
    directory,
    environmentFor(directory),
  );

  await proxy.held;
  await writeFile(join(directory, 'work', 'switch'), '');
  await waitForText(koja, first, waitFor);
  proxy.release();

  return read;
};

it(
  'returns the snapshot of a multi-part read when the pane leaves and enters the alternate screen between parts',
  async () => {
    const result = await readAcrossSwitch(
      ["printf '\\033[?1049l'", "printf '\\033[?1049h\\033[HAGAIN'"],
      'AGAIN',
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const lines = paneReadSchema.parse(JSON.parse(result.stdout)).lines;

    expect(lines).toContain('ready');
    expect(lines).not.toContain('AGAIN');
    expect(lines).toContain('300');
  },
  cliTestTimeoutMs,
);

it(
  'returns the snapshot of a multi-part read when both screen switches happen inside one write',
  async () => {
    const result = await readAcrossSwitch(
      ["printf '\\033[?1049l\\033[?1049h\\033[HAGAIN'"],
      'AGAIN',
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const lines = paneReadSchema.parse(JSON.parse(result.stdout)).lines;

    expect(lines).toContain('ready');
    expect(lines).not.toContain('AGAIN');
    expect(lines).toContain('300');
  },
  cliTestTimeoutMs,
);

const largePane = async (columns: number, rows: number) => {
  const harness = await setup();

  await connectLargeTerminal(join(harness.directory, 'run', 'koja.sock'), { columns, rows });

  let pane = (await harness.list())[0];

  for (let attempt = 0; attempt < 100 && (pane?.columns ?? 0) < columns - 40; attempt += 1) {
    await Bun.sleep(100);
    pane = (await harness.list())[0];
  }

  return harness;
};

it(
  'returns every row of a read that needs several parts once, joining a wrapped line across the part edges',
  async () => {
    const { koja, first } = await largePane(340, 131);

    const sent = await koja(
      'pane',
      'send',
      "printf '\\033[2J\\033[H'; head -c 51000 /dev/zero | tr '\\0' x; printf '\\nsecond\\n'; printf done\n",
    );

    expect(sent.exitCode).toBe(0);
    await waitForText(koja, first, 'done');

    const unwrapped = await readJson(koja, first, '--source', 'recent-unwrapped', '--lines', '200');

    expect(unwrapped.lines).toHaveLength(3);
    expect(unwrapped.lines[0]).toBe('x'.repeat(51_000));
    expect(unwrapped.lines.slice(1)).toEqual(['second', 'done']);

    const rows = await readJson(koja, first, '--source', 'recent', '--lines', '200');

    expect(rows.lines.length).toBeGreaterThan(150);
    expect(rows.lines.join('')).toBe(`${'x'.repeat(51_000)}seconddone`);
    expect((rows.to ?? 0) - (rows.from ?? 0) + 1).toBe(rows.lines.length);
  },
  cliTestTimeoutMs,
);

it(
  'pages a read larger than one snapshot by range and fails without output when the screen changes',
  async () => {
    const { directory, koja, first } = await largePane(1100, 40);

    const script = [
      "printf '\\033[2J\\033[H'",
      'seq 1 1500',
      "printf 'ready\\n'",
      wait('switch'),
      "printf '\\033[?1049h\\033[HAGAIN'",
    ].join('; ');

    expect((await koja('pane', 'send', `${script}\n`)).exitCode).toBe(0);
    await waitForText(koja, first, 'ready');

    const kept = await readJson(koja, first, '--lines', '1');
    const last = kept.to ?? 0;
    const proxyPath = join(directory, 'proxy.sock');
    const proxy = await holdFirstPage(join(directory, 'run', 'koja.sock'), proxyPath);

    const read = runCli(
      [
        'pane',
        'read',
        first,
        '--from',
        String(kept.oldest),
        '--to',
        String(last),
        '--socket',
        proxyPath,
      ],
      directory,
      environmentFor(directory),
    );

    await proxy.held;
    await writeFile(join(directory, 'work', 'switch'), '');
    await waitForText(koja, first, 'AGAIN');
    proxy.release();

    const result = await read;

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('switched between its primary and alternate screens');
  },
  cliTestTimeoutMs,
);
