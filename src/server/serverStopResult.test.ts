import { expect, it } from 'bun:test';

import { createFrameDecoder, parseControl } from '../protocol/protocol.ts';
import type { ControlMessage } from '../protocol/protocol.ts';
import { createConnection } from './connection.ts';
import type { Log } from './log.ts';
import { createStopResults } from './serverStopResult.ts';
import type { StopConnection } from './serverStopResult.ts';

const build = { version: '1.2.3', ghostty: 'abc123' };

const ignore = () => undefined;

const createRecordingLog = () => {
  const errors: string[] = [];

  const log: Log = {
    debug: ignore,
    info: ignore,
    warn: ignore,
    error: (message: string) => {
      errors.push(message);
    },
  };

  return { log, errors };
};

const createSocket = (room: number) => {
  const written: number[] = [];
  let available = room;

  return {
    written,
    grow: (bytes: number) => {
      available += bytes;
    },
    write: (bytes: Uint8Array): number => {
      const taken = Math.min(available, bytes.length);

      written.push(...bytes.subarray(0, taken));
      available -= taken;

      return taken;
    },
    end: () => undefined,
  };
};

const createFakeClock = (onWait: () => void = ignore) => {
  let time = 0;

  return {
    now: () => time,
    wait: (milliseconds: number): Promise<void> => {
      onWait();
      time += milliseconds;

      return Promise.resolve();
    },
  };
};

const createStopConnection = (socket: ReturnType<typeof createSocket>) =>
  createConnection({
    socket,
    version: build,
    log: createRecordingLog().log,
    queueLimitBytes: 1024,
    flushTimeoutMs: 5000,
    onWelcome: () => undefined,
    onMessage: () => undefined,
    onInput: () => undefined,
  });

const controlMessagesIn = (bytes: number[]): ControlMessage[] => {
  const decoded = createFrameDecoder().push(Uint8Array.from(bytes));

  if (!decoded.ok) {
    throw new Error(decoded.reason);
  }

  return decoded.frames.map((frame) => {
    const parsed = parseControl(frame.payload);

    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }

    return parsed.message;
  });
};

const createFakeConnection = (failing: boolean) => {
  const sent: ControlMessage[] = [];

  const connection: StopConnection = {
    send: (message) => {
      if (failing) {
        throw new Error('write failed');
      }

      sent.push(message);
    },
    drain: () => undefined,
    isFlushed: () => true,
    isClosed: () => false,
  };

  return { connection, sent };
};

const stopResultsFor = (connections: StopConnection[], log: Log) => {
  const results = createStopResults(log);

  for (const connection of connections) {
    results.add(connection);
  }

  return results;
};

it('publishes the stop result to every connection, even when one send throws', () => {
  const failing = createFakeConnection(true);
  const healthy = createFakeConnection(false);
  const { log, errors } = createRecordingLog();
  const failures: string[] = [];

  const results = stopResultsFor([failing.connection, healthy.connection], log);
  results.publish(failures);

  expect(healthy.sent).toEqual([{ type: 'stopResult', result: { ok: true } }]);
  expect(failures).toEqual(['Sending the stop result: write failed']);
  expect(errors).toEqual(['Sending the stop result failed.']);
});

it('publishes the failures known before the send as a failed stop result', () => {
  const healthy = createFakeConnection(false);
  const { log } = createRecordingLog();
  const failures = ['Stopping pane pane-1 failed'];

  const results = stopResultsFor([healthy.connection], log);
  results.publish(failures);

  expect(healthy.sent).toEqual([
    {
      type: 'stopResult',
      result: {
        ok: false,
        message: 'The server stopped, but its cleanup failed. Stopping pane pane-1 failed.',
      },
    },
  ]);
});

it('writes the queued stop result before the flush returns', async () => {
  const socket = createSocket(0);
  const connection = createStopConnection(socket);
  const { log } = createRecordingLog();
  const failures: string[] = [];

  const results = stopResultsFor([connection], log);
  results.publish(failures);

  expect(connection.isFlushed()).toBe(false);

  const clock = createFakeClock(() => {
    socket.grow(1024);
  });

  await results.flush({
    timeoutMs: 1000,
    failures,
    clock,
  });

  expect(connection.isFlushed()).toBe(true);
  expect(controlMessagesIn(socket.written)).toEqual([{ type: 'stopResult', result: { ok: true } }]);
});

it('stops waiting for a connection that never reads once the bound passes', async () => {
  const socket = createSocket(0);
  const connection = createStopConnection(socket);
  const { log } = createRecordingLog();
  const failures: string[] = [];

  const results = stopResultsFor([connection], log);
  results.publish(failures);

  const started = performance.now();

  await results.flush({
    timeoutMs: 50,
    failures,
  });

  expect(performance.now() - started).toBeLessThan(2000);
  expect(connection.isFlushed()).toBe(false);
  expect(socket.written).toEqual([]);
});

it('does not wait for a connection that has already closed', async () => {
  const socket = createSocket(0);
  const connection = createStopConnection(socket);
  const { log } = createRecordingLog();
  const failures: string[] = [];
  let waits = 0;

  const results = stopResultsFor([connection], log);
  results.publish(failures);
  connection.close();

  await results.flush({
    timeoutMs: 2000,
    failures,
    clock: createFakeClock(() => {
      waits += 1;
    }),
  });

  expect(waits).toBe(0);
});

it('records a drain failure, stops waiting for that connection, and still flushes the others', async () => {
  const failing: StopConnection = {
    send: ignore,
    drain: () => {
      throw new Error('drain write failed');
    },
    isFlushed: () => false,
    isClosed: () => false,
  };

  const socket = createSocket(0);
  const healthy = createStopConnection(socket);

  const { log, errors } = createRecordingLog();
  const failures: string[] = [];

  const clock = createFakeClock(() => {
    socket.grow(1024);
  });

  const results = stopResultsFor([failing, healthy], log);
  results.publish(failures);

  await results.flush({
    timeoutMs: 1000,
    failures,
    clock,
  });

  expect(failures).toEqual(['Flushing the stop result: drain write failed']);
  expect(errors).toEqual(['Flushing the stop result failed.']);
  expect(healthy.isFlushed()).toBe(true);
  expect(controlMessagesIn(socket.written)).toEqual([{ type: 'stopResult', result: { ok: true } }]);
  expect(clock.now()).toBeLessThan(1000);
});

it('records a failure it did not foresee and still resolves', async () => {
  const broken: StopConnection = {
    send: ignore,
    drain: ignore,
    isFlushed: () => {
      throw new Error('state lost');
    },
    isClosed: () => false,
  };

  const { log } = createRecordingLog();
  const failures: string[] = [];
  const results = stopResultsFor([broken], log);

  await results.flush({
    timeoutMs: 1000,
    failures,
    clock: createFakeClock(),
  });

  expect(failures).toEqual(['Flushing the stop result: state lost']);
});

it('sends the published result to a stop connection added during the flush and waits for it', async () => {
  const earlySocket = createSocket(0);
  const early = createStopConnection(earlySocket);
  const lateSocket = createSocket(0);
  const late = createStopConnection(lateSocket);
  const { log } = createRecordingLog();
  const failures = ['Stopping pane pane-1 failed'];
  const results = stopResultsFor([early], log);
  let waits = 0;

  const clock = createFakeClock(() => {
    waits += 1;

    if (waits === 1) {
      results.add(late);
      earlySocket.grow(1024);

      return;
    }

    lateSocket.grow(1024);
  });

  results.publish(failures);
  await results.flush({ timeoutMs: 1000, failures, clock });

  const published = controlMessagesIn(earlySocket.written);

  expect(published).toEqual([
    {
      type: 'stopResult',
      result: {
        ok: false,
        message: 'The server stopped, but its cleanup failed. Stopping pane pane-1 failed.',
      },
    },
  ]);

  expect(controlMessagesIn(lateSocket.written)).toEqual(published);
  expect(late.isFlushed()).toBe(true);
  expect(clock.now()).toBeLessThan(1000);
});

it('records a failed send to a stop connection added after the publication and does not throw', async () => {
  const failing = createFakeConnection(true);
  const healthy = createFakeConnection(false);
  const { log, errors } = createRecordingLog();
  const failures: string[] = [];
  const results = stopResultsFor([], log);

  results.publish(failures);
  results.add(failing.connection);
  results.add(healthy.connection);
  await results.flush({ timeoutMs: 1000, failures, clock: createFakeClock() });

  expect(healthy.sent).toEqual([{ type: 'stopResult', result: { ok: true } }]);
  expect(failures).toEqual(['Sending the stop result: write failed']);
  expect(errors).toEqual(['Sending the stop result failed.']);
});
