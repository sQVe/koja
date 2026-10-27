import { afterAll, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BenchmarkClient } from '../scripts/benchmarkClient.ts';
import { runHiddenOutput } from '../scripts/benchmarkHidden.ts';
import { unboundedFloodCommand } from '../scripts/benchmarkMeasure.ts';
import type { ScenarioContext } from '../scripts/benchmarkMeasure.ts';
import { runPaneList } from '../scripts/benchmarkPaneList.ts';
import { runResizeBurst } from '../scripts/benchmarkResize.ts';
import { guestCommandTemplates } from '../scripts/benchmarkScenarios.ts';
import { runBusyScroll } from '../scripts/benchmarkScroll.ts';
import type { CliResult } from '../scripts/benchmarkServer.ts';
import { runTypingUnderFlood } from '../scripts/benchmarkTyping.ts';

type ClientEvent =
  | { kind: 'send'; pane: string; command: string }
  | { kind: 'type'; input: string };

interface FakeScreen {
  client: BenchmarkClient;
  show: (rows: string[], status?: string) => void;
}

interface FloodTiming {
  floodEnds: (typedSamples: number) => boolean;
  showEnd?: boolean;
  startDelayMs?: number | 'never';
}

const shellOutput = (command: string): string[] => {
  const ran = Bun.spawnSync(['sh', '-c', command], { stdout: 'pipe', stderr: 'pipe' });

  return new TextDecoder().decode(ran.stdout).split('\n');
};

const fakeScreen = (onType: (input: string) => void): FakeScreen => {
  const waiters = new Set<() => void>();
  let text = 'INSERT [1]';

  const waitFor = (condition: () => boolean, description: string, timeoutMs = 5_000) => {
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
      done.reject(new Error(`${description} did not happen. Screen:\n${text}`));
    }, timeoutMs);

    waiters.add(check);

    return done.promise.finally(() => {
      clearTimeout(timer);
    });
  };

  const client: BenchmarkClient = {
    processId: process.pid,
    text: () => text,
    type: onType,
    resize: () => undefined,
    waitFor,
    waitForText: (wanted, timeoutMs) =>
      waitFor(() => text.includes(wanted), `The screen did not show ${wanted}`, timeoutMs),
    stop: async () => undefined,
  };

  return {
    client,
    show: (rows, status = 'INSERT [1]') => {
      text = [...rows, status].join('\n');

      for (const waiter of waiters) {
        waiter();
      }
    },
  };
};

const testFolder = mkdtempSync(join(tmpdir(), 'koja-bench-scenarios-'));

afterAll(() => {
  rmSync(testFolder, { recursive: true, force: true });
});

const scenarioContext = (
  client: BenchmarkClient,
  onSend: (pane: string, command: string) => void,
  samples: number,
): ScenarioContext => ({
  folder: mkdtempSync(join(testFolder, 'run-')),
  environment: {},
  serverProcessId: process.pid,
  koja: async (...commandArguments: string[]): Promise<CliResult> => {
    const [, action, command = '', , pane = ''] = commandArguments;

    if (action === 'send') {
      onSend(pane, command.replace(/\n$/, ''));
    }

    return { exitCode: 0, stdout: '', stderr: '' };
  },
  cli: async (): Promise<CliResult> => ({ exitCode: 0, stdout: '', stderr: '' }),
  client,
  panes: {
    visible: ['pane-1', 'pane-2'],
    focused: 'pane-1',
    hidden: 'pane-3',
    visibleTab: 'tab-1',
  },
  configuration: {
    columns: 80,
    rows: 24,
    samples,
    idleDurationMs: 10,
    floodBytes: 100,
    resizeCount: 1,
  },
});

const floodOutputDelayMs = 20;

const echoDelayMs = 30;

const endedShellOutput = (command: string): string[] =>
  shellOutput(command.replace('< /dev/zero', '< /dev/null'));

const startFlood = (command: string): void => {
  shellOutput(command.slice(0, command.indexOf('; tr ')));
};

const typingScreen = (
  events: ClientEvent[],
  { floodEnds, showEnd = true, startDelayMs = 0 }: FloodTiming,
) => {
  let output: string[] = [];
  let typedLine = '';
  let typedSamples = 0;
  let unboundedFlood: string | undefined;
  let floodStarted = false;
  const typedBeforeStart: string[] = [];

  const screen = fakeScreen((input) => {
    events.push({ kind: 'type', input });

    if (!floodStarted) {
      typedBeforeStart.push(input);
    }

    if (input === '\u0015') {
      typedLine = '';
      screen.show([...output, typedLine]);

      return;
    }

    typedSamples += 1;

    setTimeout(() => {
      typedLine += input;
      screen.show([...output, typedLine]);

      if (unboundedFlood !== undefined && floodEnds(typedSamples)) {
        const ended = endedShellOutput(unboundedFlood);

        output = showEnd ? [...output, ...ended] : output;
        unboundedFlood = undefined;
        screen.show([...output, typedLine]);
      }
    }, echoDelayMs);
  });

  const onSend = (pane: string, command: string): void => {
    events.push({ kind: 'send', pane, command });

    if (command.includes('< /dev/zero')) {
      unboundedFlood = command;

      if (startDelayMs !== 'never') {
        setTimeout(() => {
          startFlood(command);
          floodStarted = true;
        }, startDelayMs);
      }

      return;
    }

    if (command === '\u0003') {
      unboundedFlood = undefined;

      return;
    }

    setTimeout(() => {
      output = [...output, ...shellOutput(command)];
      screen.show([...output, typedLine]);
    }, floodOutputDelayMs);
  };

  return { screen, onSend, typedBeforeStart };
};

it('times flood completion from a fixed flood before typing, then types under an unbounded flood', async () => {
  const events: ClientEvent[] = [];
  const { screen, onSend } = typingScreen(events, { floodEnds: () => false });

  const result = await runTypingUnderFlood(scenarioContext(screen.client, onSend, 5));

  expect(result.gaps.filter((gap) => gap.metric !== 'guests')).toEqual([]);
  expect(result.latencyMs).toHaveLength(5);
  expect(result.completionMs?.[0]).toBeLessThan(echoDelayMs);

  const sends = events.flatMap((event, index) =>
    event.kind === 'send' && event.pane === 'pane-2' ? [{ index, command: event.command }] : [],
  );

  const typed = events.flatMap((event, index) =>
    event.kind === 'type' && event.input !== '\u0015' ? [index] : [],
  );

  const [fixed, unbounded, interrupt] = sends;

  expect(fixed?.command).toContain('head -c 100 /dev/zero');
  expect(unbounded?.command).toContain('< /dev/zero');
  expect(unbounded?.index).toBeLessThan(typed[0] ?? -1);
  expect(interrupt?.command).toBe('\u0003');
  expect(interrupt?.index).toBeGreaterThan(typed.at(-1) ?? Infinity);
});

it('refuses typing samples once the sibling flood has ended and records a gap', async () => {
  const events: ClientEvent[] = [];

  const { screen, onSend } = typingScreen(events, {
    floodEnds: (typedSamples) => typedSamples >= 2,
  });

  const result = await runTypingUnderFlood(scenarioContext(screen.client, onSend, 5));

  expect(result.latencyMs).toHaveLength(1);
  expect(result.gaps.filter((gap) => gap.metric === 'latencyMs').length).toBeGreaterThan(0);

  expect(events.filter((event) => event.kind === 'type' && event.input !== '\u0015')).toHaveLength(
    2,
  );
});

it('refuses typing samples after the flood ended even when the screen cannot show its end', async () => {
  const events: ClientEvent[] = [];

  const { screen, onSend } = typingScreen(events, {
    floodEnds: (typedSamples) => typedSamples >= 2,
    showEnd: false,
  });

  const result = await runTypingUnderFlood(scenarioContext(screen.client, onSend, 5));

  expect(result.latencyMs).toHaveLength(1);
  expect(result.gaps.filter((gap) => gap.metric === 'latencyMs').length).toBeGreaterThan(0);

  expect(events.filter((event) => event.kind === 'type' && event.input !== '\u0015')).toHaveLength(
    2,
  );
});

const floodStartDelayMs = 100;

it('types the first sample only after the sibling flood has started', async () => {
  const events: ClientEvent[] = [];

  const { screen, onSend, typedBeforeStart } = typingScreen(events, {
    floodEnds: () => false,
    startDelayMs: floodStartDelayMs,
  });

  const result = await runTypingUnderFlood(scenarioContext(screen.client, onSend, 3));

  expect(typedBeforeStart).toEqual([]);
  expect(result.latencyMs).toHaveLength(3);
});

it('takes no typing sample and records a gap when the sibling flood never starts', async () => {
  const events: ClientEvent[] = [];

  const { screen, onSend } = typingScreen(events, {
    floodEnds: () => false,
    startDelayMs: 'never',
  });

  const result = await runTypingUnderFlood(scenarioContext(screen.client, onSend, 3));

  expect(result.latencyMs).toEqual([]);
  expect(result.gaps.map((gap) => gap.metric)).toContain('latencyMs');
  expect(events.filter((event) => event.kind === 'type')).toEqual([]);
}, 15_000);

const historyTailRows = 10;

const scrollDrawDelayMs = 15;

const scrollScreen = (events: ClientEvent[], startDelayMs = 0) => {
  let history: string[] = [];
  let floodStarted = false;
  const typedBeforeStart: string[] = [];

  const screen = fakeScreen((input) => {
    events.push({ kind: 'type', input });

    if (!floodStarted) {
      typedBeforeStart.push(input);
    }

    setTimeout(() => {
      if (input.endsWith('g')) {
        screen.show(history.slice(0, historyTailRows), 'SCROLL [1]');
      } else {
        screen.show(history.slice(-historyTailRows));
      }
    }, scrollDrawDelayMs);
  });

  const onSend = (pane: string, command: string): void => {
    events.push({ kind: 'send', pane, command });

    const floods = command === '\u0003' || command.includes('/dev/zero');

    if (command.includes('< /dev/zero')) {
      setTimeout(() => {
        startFlood(command);
        floodStarted = true;
      }, startDelayMs);
    }

    if (pane !== 'pane-1' && !floods) {
      screen.show([...screen.client.text().split('\n').slice(0, -1), ...shellOutput(command)]);
    }

    if (pane !== 'pane-1') {
      return;
    }

    history = shellOutput(command).filter((row) => row !== '');
    screen.show(history.slice(0, 1));

    setTimeout(() => {
      screen.show(history.slice(-historyTailRows));
    }, scrollDrawDelayMs);
  };

  return { screen, onSend, typedBeforeStart };
};

it('scrolls for the first sample only after the sibling flood has started', async () => {
  const events: ClientEvent[] = [];
  const { screen, onSend, typedBeforeStart } = scrollScreen(events, floodStartDelayMs);

  const result = await runBusyScroll(scenarioContext(screen.client, onSend, 2));

  expect(typedBeforeStart).toEqual([]);
  expect(result.latencyMs).toHaveLength(2);
});

it('times each scroll sample from a new scroll-mode frame after the history is written', async () => {
  const events: ClientEvent[] = [];
  const { screen, onSend } = scrollScreen(events);

  const result = await runBusyScroll(scenarioContext(screen.client, onSend, 3));

  expect(result.latencyMs).toHaveLength(3);

  for (const latency of result.latencyMs ?? []) {
    expect(latency).toBeGreaterThanOrEqual(scrollDrawDelayMs - 2);
  }
});

it('keeps the sibling flood running from before the first scroll sample until after the last', async () => {
  const events: ClientEvent[] = [];
  const { screen, onSend } = scrollScreen(events);

  await runBusyScroll(scenarioContext(screen.client, onSend, 3));

  const floodSends = events.flatMap((event, index) =>
    event.kind === 'send' && event.pane === 'pane-2' ? [{ index, command: event.command }] : [],
  );

  const scrollInputs = events.flatMap((event, index) =>
    event.kind === 'type' && event.input.endsWith('g') ? [index] : [],
  );

  const [flood, interrupt] = floodSends;

  expect(flood?.index).toBeLessThan(scrollInputs[0] ?? -1);
  expect(interrupt?.command).toBe('\u0003');
  expect(interrupt?.index).toBeGreaterThan(scrollInputs.at(-1) ?? Infinity);

  // timeout signals the whole process group, so the flood's tr child cannot outlive the test.
  const running = Bun.spawn(['timeout', '0.3', 'sh', '-c', flood?.command ?? 'true'], {
    stdout: 'ignore',
    stderr: 'ignore',
  });

  const timedOut = 124;

  expect(await running.exited).toBe(timedOut);
});

it('leaves scroll mode once per sample and sends no extra leave key after the last one', async () => {
  const events: ClientEvent[] = [];
  const { screen, onSend } = scrollScreen(events);

  const result = await runBusyScroll(scenarioContext(screen.client, onSend, 3));

  expect(result.latencyMs).toHaveLength(3);
  expect(events.filter((event) => event.kind === 'type' && event.input === 'q')).toHaveLength(3);
});

it('writes the flood sentinel when the flood ends, even in a folder whose name holds an apostrophe', async () => {
  const folder = mkdtempSync(join(tmpdir(), "koja-bench-it's-"));
  const sentinel = join(folder, 'typing-flood.ended');

  try {
    const shell = Bun.spawn(['sh', '-c', unboundedFloodCommand(folder, 'TYPING')], {
      stdout: 'ignore',
      stderr: 'ignore',
    });

    await Bun.sleep(100);
    Bun.spawnSync(['pkill', '-P', String(shell.pid), 'tr']);

    expect(await shell.exited).toBe(0);
    expect(existsSync(sentinel)).toBe(true);
    expect(existsSync(join(folder, 'typing-flood.started'))).toBe(true);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

const readsBeforeMarker = 3;

it('completes a hidden sample only once a pane read shows the end marker', async () => {
  const screen = fakeScreen(() => undefined);
  const context = scenarioContext(screen.client, () => undefined, 2);
  const reads: number[] = [];
  let endMarker = '';

  context.koja = async (...commandArguments: string[]): Promise<CliResult> => {
    const [, action, command = ''] = commandArguments;

    if (action === 'send') {
      endMarker = shellOutput(command.replace(/^head .*; printf/, 'printf')).join('');
      reads.push(0);
    }

    if (action === 'read') {
      const count = (reads.at(-1) ?? 0) + 1;

      reads[reads.length - 1] = count;

      const stdout = count > readsBeforeMarker ? `hhhh\n${endMarker}\n` : 'hhhh\n';

      return { exitCode: 0, stdout, stderr: '' };
    }

    return { exitCode: 0, stdout: '', stderr: '' };
  };

  const result = await runHiddenOutput(context);

  expect(reads).toEqual([readsBeforeMarker + 1, readsBeforeMarker + 1]);
  expect(result.completionMs).toHaveLength(2);
});

const resizeDrawDelayMs = 20;

const frameRows = (columns: number, rows: number): string[] => [
  ...Array.from({ length: rows - 2 }, () => `│${' '.repeat(columns - 2)}│`),
  `└${'─'.repeat(columns - 2)}┘`,
];

it('ends a resize sample only on a whole frame drawn at the final size', async () => {
  const screen = fakeScreen(() => undefined);
  const context = scenarioContext(screen.client, () => undefined, 3);
  const { columns, rows } = context.configuration;

  screen.show(frameRows(columns, rows));

  context.client = {
    ...screen.client,
    resize: (nextColumns, nextRows) => {
      screen.show(frameRows(nextColumns, nextRows), '');

      setTimeout(() => {
        screen.show(frameRows(nextColumns, nextRows));
      }, resizeDrawDelayMs);
    },
  };

  const result = await runResizeBurst(context);

  expect(result.gaps.filter((gap) => gap.metric === 'latencyMs')).toEqual([]);
  expect(result.latencyMs).toHaveLength(3);

  for (const latency of result.latencyMs ?? []) {
    expect(latency).toBeGreaterThanOrEqual(resizeDrawDelayMs - 2);
  }
});

it('times the start-up control through the run CLI runner, which applies the CPU placement', async () => {
  const screen = fakeScreen(() => undefined);
  const context = scenarioContext(screen.client, () => undefined, 3);
  const controls: string[][] = [];

  context.cli = async (...commandArguments: string[]): Promise<CliResult> => {
    controls.push(commandArguments);

    return { exitCode: 0, stdout: '', stderr: '' };
  };

  const result = await runPaneList(context);

  expect(controls).toEqual([['--version'], ['--version'], ['--version']]);
  expect(result.controlMs).toHaveLength(3);
});

it('prints every searched marker from guest output, never from the typed command line', () => {
  const markerPattern = /<[A-Z-]+-MARKER>/g;
  const printed = new Set<string>();

  for (const [name, command] of Object.entries(guestCommandTemplates(100))) {
    expect({ name, typed: command.match(markerPattern) }).toEqual({ name, typed: null });

    for (const line of endedShellOutput(command)) {
      for (const found of line.match(markerPattern) ?? []) {
        printed.add(found);
      }
    }
  }

  expect([...printed].toSorted()).toEqual([
    '<FLOOD-END-MARKER>',
    '<HIDDEN-END-MARKER>',
    '<HISTORY-END-MARKER>',
    '<SCROLL-STOP-MARKER>',
    '<TYPING-STOP-MARKER>',
  ]);
});
