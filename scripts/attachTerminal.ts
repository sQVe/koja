import { createTerminal } from '../src/vt/vt.ts';
import type { Terminal } from '../src/vt/vt.ts';

export interface AttachTerminal {
  processId: number;
  screen: Terminal;
  type: (input: string) => void;
  resize: (columns: number, rows: number) => void;
  waitFor: (
    condition: () => boolean,
    timeoutMs: number,
    failureMessage: () => string,
  ) => Promise<number>;
  stop: () => Promise<void>;
}

interface AttachTerminalOptions {
  command: string[];
  cwd: string;
  environment: Record<string, string | undefined>;
  columns: number;
  rows: number;
}

export const startAttachTerminal = (options: AttachTerminalOptions): AttachTerminal => {
  const created = createTerminal(options.columns, options.rows, 0);

  if (!created.ok) {
    throw new Error(created.reason === 'library-missing' ? created.detail : created.reason);
  }

  const screen = created.terminal;
  const waiters = new Set<() => void>();

  const client = Bun.spawn(options.command, {
    cwd: options.cwd,
    env: { ...options.environment, COLORTERM: 'truecolor', TERM: 'xterm-256color' },
    terminal: {
      cols: options.columns,
      rows: options.rows,
      data: (terminal, bytes) => {
        const { reply } = screen.write(bytes);

        if (reply !== undefined) {
          terminal.write(reply);
        }

        for (const waiter of waiters) {
          waiter();
        }
      },
    },
  });

  const waitFor = (
    condition: () => boolean,
    timeoutMs: number,
    failureMessage: () => string,
  ): Promise<number> => {
    const started = performance.now();

    if (condition()) {
      return Promise.resolve(0);
    }

    const done = Promise.withResolvers<number>();

    const check = (): void => {
      if (condition()) {
        waiters.delete(check);
        done.resolve(performance.now() - started);
      }
    };

    const timer = setTimeout(() => {
      waiters.delete(check);
      done.reject(new Error(failureMessage()));
    }, timeoutMs);

    waiters.add(check);

    return done.promise.finally(() => {
      clearTimeout(timer);
    });
  };

  let stopped = false;

  const stop = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    stopped = true;
    client.kill();
    await client.exited;
    client.terminal?.close();
    screen[Symbol.dispose]();
  };

  return {
    processId: client.pid,
    screen,
    type: (input) => {
      client.terminal?.write(input);
    },
    resize: (columns, rows) => {
      screen.resize(columns, rows);
      client.terminal?.resize(columns, rows);
    },
    waitFor,
    stop,
  };
};
