import { afterAll, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BenchmarkClient } from '../scripts/benchmarkClient.ts';
import { unboundedFloodCommand } from '../scripts/benchmarkMeasure.ts';
import type { ScenarioContext } from '../scripts/benchmarkMeasure.ts';
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

const shellOutput = (command: string): string[] => {
  const ran = Bun.spawnSync(['sh', '-c', command], { stdout: 'pipe', stderr: 'pipe' });

  return new TextDecoder().decode(ran.stdout).split('\n');
};

// A client whose screen the test scripts, with the waiter rules of the real attach driver.
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

// Guest commands write their sentinel files here, as they would in the run folder.
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

// Runs a command the way the guest shell would, with an unbounded flood reading empty input so
// it ends at once.
const endedShellOutput = (command: string): string[] =>
  shellOutput(command.replace('< /dev/zero', '< /dev/null'));

// The focused pane echoes typed keys and Ctrl+U erases the typed line. The sibling pane prints
// the output of fixed floods and markers; its unbounded flood ends only when floodEnds says so.
// With showEnd false the flood ends without any output the client can read, as in a narrow pane.
const typingScreen = (
  events: ClientEvent[],
  floodEnds: (typedSamples: number) => boolean,
  showEnd = true,
) => {
  let output: string[] = [];
  let typedLine = '';
  let typedSamples = 0;
  let unboundedFlood: string | undefined;

  const screen = fakeScreen((input) => {
    events.push({ kind: 'type', input });

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

  return { screen, onSend };
};

it('times flood completion from a fixed flood before typing, then types under an unbounded flood', async () => {
  const events: ClientEvent[] = [];
  const { screen, onSend } = typingScreen(events, () => false);

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
  const { screen, onSend } = typingScreen(events, (typedSamples) => typedSamples >= 2);

  const result = await runTypingUnderFlood(scenarioContext(screen.client, onSend, 5));

  expect(result.latencyMs).toHaveLength(1);
  expect(result.gaps.filter((gap) => gap.metric === 'latencyMs').length).toBeGreaterThan(0);

  expect(events.filter((event) => event.kind === 'type' && event.input !== '\u0015')).toHaveLength(
    2,
  );
});

it('refuses typing samples after the flood ended even when the screen cannot show its end', async () => {
  const events: ClientEvent[] = [];
  const { screen, onSend } = typingScreen(events, (typedSamples) => typedSamples >= 2, false);

  const result = await runTypingUnderFlood(scenarioContext(screen.client, onSend, 5));

  expect(result.latencyMs).toHaveLength(1);
  expect(result.gaps.filter((gap) => gap.metric === 'latencyMs').length).toBeGreaterThan(0);

  expect(events.filter((event) => event.kind === 'type' && event.input !== '\u0015')).toHaveLength(
    2,
  );
});

const historyTailRows = 10;

const scrollDrawDelayMs = 15;

// The history command shows its first row at once and its last rows a moment later. Scroll mode
// shows the first rows; leaving it shows the last rows again.
const scrollScreen = (events: ClientEvent[]) => {
  let history: string[] = [];

  const screen = fakeScreen((input) => {
    events.push({ kind: 'type', input });

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

  return { screen, onSend };
};

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
    const shell = Bun.spawn(['sh', '-c', unboundedFloodCommand(sentinel)], {
      stdout: 'ignore',
      stderr: 'ignore',
    });

    await Bun.sleep(100);
    Bun.spawnSync(['pkill', '-P', String(shell.pid), 'tr']);

    expect(await shell.exited).toBe(0);
    expect(existsSync(sentinel)).toBe(true);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
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
