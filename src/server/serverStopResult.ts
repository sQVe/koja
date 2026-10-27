import type { ControlMessage } from '../protocol/protocol.ts';
import type { Log } from './log.ts';

export type StopOutcome = Extract<ControlMessage, { type: 'stopResult' }>['result'];

export interface StopConnection {
  send: (message: ControlMessage) => void;
  drain: () => void;
  isFlushed: () => boolean;
  isClosed: () => boolean;
}

interface FlushClock {
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
}

interface FlushOptions {
  timeoutMs: number;
  failures: string[];
  clock?: FlushClock;
}

export interface StopResults {
  add: (connection: StopConnection) => void;
  publish: (failures: string[]) => void;
  flush: (options: FlushOptions) => Promise<void>;
}

const flushPollMs = 10;

const realClock: FlushClock = {
  now: () => performance.now(),
  wait: (milliseconds) => Bun.sleep(milliseconds),
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const recordFailure = (failures: string[], log: Log, step: string, error: unknown): void => {
  log.error(`${step} failed.`, { error: describeError(error) });
  failures.push(`${step}: ${describeError(error)}`);
};

export const stopOutcomeOf = (failures: readonly string[]): StopOutcome =>
  failures.length === 0
    ? { ok: true }
    : { ok: false, message: `The server stopped, but its cleanup failed. ${failures.join('. ')}.` };

const sendStopResult = (
  connection: StopConnection,
  result: StopOutcome,
  failures: string[],
  log: Log,
): void => {
  try {
    connection.send({ type: 'stopResult', result });
  } catch (error) {
    recordFailure(failures, log, 'Sending the stop result', error);
  }
};

const flushWithin = async (
  connections: ReadonlySet<StopConnection>,
  log: Log,
  { timeoutMs, failures, clock = realClock }: FlushOptions,
): Promise<void> => {
  const broken = new Set<StopConnection>();
  const deadline = clock.now() + timeoutMs;

  const waitingOn = (): StopConnection[] =>
    [...connections].filter(
      (connection) => !broken.has(connection) && !connection.isClosed() && !connection.isFlushed(),
    );

  let waiting = waitingOn();

  while (waiting.length > 0 && clock.now() < deadline) {
    for (const connection of waiting) {
      try {
        connection.drain();
      } catch (error) {
        broken.add(connection);
        recordFailure(failures, log, 'Flushing the stop result', error);
      }
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- each check must follow the last wait.
    await clock.wait(flushPollMs);

    waiting = waitingOn();
  }
};

// A connection added after the publication gets the published outcome at once, and the flush
// waits for it too, because the flush may yield while a stop request arrives.
export const createStopResults = (log: Log): StopResults => {
  const connections = new Set<StopConnection>();
  let published: { result: StopOutcome; failures: string[] } | undefined;

  return {
    add: (connection) => {
      connections.add(connection);

      if (published !== undefined) {
        sendStopResult(connection, published.result, published.failures, log);
      }
    },
    publish: (failures) => {
      const result = stopOutcomeOf(failures);

      published = { result, failures };

      for (const connection of connections) {
        sendStopResult(connection, result, failures, log);
      }
    },
    flush: async (options) => {
      try {
        await flushWithin(connections, log, options);
      } catch (error) {
        recordFailure(options.failures, log, 'Flushing the stop result', error);
      }
    },
  };
};
