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
  log: Log;
  clock?: FlushClock;
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

export const publishStopResults = (
  connections: Iterable<StopConnection>,
  failures: string[],
  log: Log,
): void => {
  const result = stopOutcomeOf(failures);

  for (const connection of connections) {
    try {
      connection.send({ type: 'stopResult', result });
    } catch (error) {
      recordFailure(failures, log, 'Sending the stop result', error);
    }
  }
};

const flushWithin = async (
  connections: Iterable<StopConnection>,
  { timeoutMs, failures, log, clock = realClock }: FlushOptions,
): Promise<void> => {
  const stopConnections = [...connections];
  const broken = new Set<StopConnection>();
  const deadline = clock.now() + timeoutMs;

  const waitingOn = (): StopConnection[] =>
    stopConnections.filter(
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

export const flushStopResults = async (
  connections: Iterable<StopConnection>,
  options: FlushOptions,
): Promise<void> => {
  try {
    await flushWithin(connections, options);
  } catch (error) {
    recordFailure(options.failures, options.log, 'Flushing the stop result', error);
  }
};
