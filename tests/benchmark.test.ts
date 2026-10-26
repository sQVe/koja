import { expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { readServerReadiness } from '../scripts/benchmarkServer.ts';
import { root, temporaryDirectory } from './cliHarness.ts';
import { isRunning, serverProcessesIn, waitFor } from './serverProcesses.ts';

const scenarioNames = [
  'idle',
  'typingUnderFlood',
  'busyScroll',
  'hiddenOutput',
  'resizeBurst',
  'paneList',
] as const;

const resourcesSchema = z.object({
  cpuMs: z.number().nonnegative(),
  rssKb: z.object({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    peak: z.number().nonnegative(),
  }),
});

const guestsSchema = z.object({
  scopes: z.array(z.string()),
  cpuMs: z.number().nonnegative(),
  memoryBytes: z.object({ lifetimePeak: z.number().nonnegative(), end: z.number().nonnegative() }),
});

const scenarioSchema = z.object({
  latencyMs: z.array(z.number().nonnegative()).optional(),
  completionMs: z.array(z.number().nonnegative()).optional(),
  controlMs: z.array(z.number().nonnegative()).optional(),
  client: resourcesSchema.optional(),
  server: resourcesSchema.optional(),
  guests: guestsSchema.optional(),
});

const configurationSchema = z.looseObject({
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  samples: z.number().int().positive(),
});

const resultSchema = z.object({
  version: z.literal(1),
  run: z.object({
    root: z.string(),
    runFolder: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    bunVersion: z.string(),
  }),
  configuration: configurationSchema,
  revision: z.object({
    head: z.string().regex(/^[0-9a-f]{40}$/),
    runtimeRevision: z.string().regex(/^[0-9a-f]{40}$/),
  }),
  machine: z.object({ cpuModel: z.string(), cores: z.number().int().positive() }),
  placement: z.object({
    cpus: z.array(z.number().int().nonnegative()).optional(),
    source: z.string(),
    pinned: z.boolean(),
  }),
  scenarios: z.record(z.string(), scenarioSchema),
  gaps: z.array(z.object({ scenario: z.string(), metric: z.string(), reason: z.string() })),
});

const hasTimingSamples = (scenario: z.infer<typeof scenarioSchema>): boolean =>
  (scenario.latencyMs?.length ?? 0) > 0 ||
  (scenario.completionMs?.length ?? 0) > 0 ||
  (scenario.controlMs?.length ?? 0) > 0;

const runBenchmark = async (output: string): Promise<z.infer<typeof resultSchema>> => {
  const child = Bun.spawn(
    [
      process.execPath,
      join(root, 'scripts/benchmark.ts'),
      '--output',
      output,
      '--columns',
      '100',
      '--rows',
      '30',
      '--samples',
      '1',
      '--duration-ms',
      '100',
      '--flood-bytes',
      '200000',
      '--resize-count',
      '2',
    ],
    {
      cwd: root,
      env: process.env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });

  return resultSchema.parse(JSON.parse(await readFile(output, 'utf8')));
};

const expectIsolated = (result: z.infer<typeof resultSchema>): void => {
  expect(existsSync(result.run.runFolder)).toBe(false);
  expect(serverProcessesIn(result.run.runFolder)).toEqual([]);
};

it('runs every scenario twice with one structured and stable configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-bench-report-'));

  try {
    const first = await runBenchmark(join(directory, 'first.json'));
    const second = await runBenchmark(join(directory, 'second.json'));

    expect(Object.keys(first.scenarios).toSorted()).toEqual([...scenarioNames].toSorted());

    for (const name of scenarioNames) {
      const scenario = first.scenarios[name];
      const gaps = first.gaps.filter((gap) => gap.scenario === name);

      if (name === 'idle') {
        expect(scenario?.latencyMs).toBeUndefined();
        expect(scenario?.completionMs).toBeUndefined();
        expect(scenario?.controlMs).toBeUndefined();
      } else {
        expect(hasTimingSamples(scenario ?? {}) || gaps.length > 0).toBe(true);
      }

      const hasTiming =
        scenario?.latencyMs !== undefined ||
        scenario?.completionMs !== undefined ||
        scenario?.controlMs !== undefined;

      const hasResources = scenario?.client !== undefined || scenario?.server !== undefined;

      expect(hasTiming || hasResources || gaps.length > 0).toBe(true);
    }

    expect(first.scenarios.paneList?.latencyMs?.length).toBeGreaterThan(0);
    expect(first.scenarios.paneList?.controlMs?.length).toBeGreaterThan(0);
    expect(first.scenarios.paneList?.completionMs).toBeUndefined();

    const configurationText = JSON.stringify(first.configuration);

    expect(configurationText).not.toContain(first.run.runFolder);
    expect(configurationText).not.toContain(root);
    expect(first.configuration).not.toHaveProperty('runFolder');
    expect(first.configuration).not.toHaveProperty('root');
    expect(first.configuration).not.toHaveProperty('startTime');
    expect(first.configuration).not.toHaveProperty('endTime');
    expect(first.configuration).not.toHaveProperty('bunVersion');
    expect(second.configuration).toEqual(first.configuration);

    const recordedCommands = z
      .record(z.string(), z.union([z.string(), z.array(z.string())]))
      .parse(first.configuration.commands);

    const kojaCommands = Object.entries(recordedCommands).filter(([name]) => name !== 'version');

    for (const [name, recorded] of kojaCommands) {
      for (const command of [recorded].flat()) {
        expect({ name, socket: command.includes('--socket <run>/run/koja.sock') }).toEqual({
          name,
          socket: true,
        });
      }
    }

    expectIsolated(first);
    expectIsolated(second);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 180_000);

const resources = (cpuMs: number) => ({
  cpuMs,
  rssKb: { start: 1000, end: 1100, peak: 1200 },
});

const guests = {
  scopes: ['koja-pane-1-a.scope'],
  cpuMs: 3,
  memoryBytes: { lifetimePeak: 4096, end: 2048 },
};

const measured = { client: resources(10), server: resources(20), guests };

const compareFixture = () => ({
  version: 1,
  run: {
    root: '/repository/',
    runFolder: '/tmp/koja-bench-first',
    startTime: '2026-10-26T09:00:00.000Z',
    endTime: '2026-10-26T09:01:00.000Z',
    bunVersion: '1.4.4',
  },
  configuration: {
    columns: 200,
    rows: 50,
    samples: 4,
    idleDurationMs: 2000,
    floodBytes: 8_000_000,
    resizeCount: 8,
    visiblePanes: 4,
    hiddenPanes: 1,
    ghosttyCommit: '83edd491e3024ae5e50393d62877b8897da1cccd',
    commands: {
      server: 'bun <root>/src/index.ts server run --socket <run>/run/koja.sock --json',
      attach: 'bun <root>/src/index.ts attach --socket <run>/run/koja.sock',
      workspaceCreate: 'bun <root>/src/index.ts workspace create <run>/work --focus --json',
      paneSplit: ['bun <root>/src/index.ts pane split <first-pane> --direction below --json'],
      paneFocus: 'bun <root>/src/index.ts pane focus <first-pane> --json',
      tabCreate: 'bun <root>/src/index.ts tab create --no-focus --json',
      paneList: 'bun <root>/src/index.ts pane list --json',
      version: 'bun <root>/src/index.ts --version',
      paneRead: 'bun <root>/src/index.ts pane read <hidden-pane> --lines 1000',
    },
    attachTerminal: { columns: 200, rows: 50 },
    guestPlacement: 'inherited-from-server',
    guestCommands: { control: 'bun <root>/src/index.ts --version' },
    typedInput: { typing: '<TYPED-MARKER> then ctrl+u, never submitted' },
    panes: {
      visible: ['pane-1', 'pane-2', 'pane-3', 'pane-4'],
      focused: 'pane-1',
      hidden: 'pane-5',
      visibleTab: 'tab-1',
    },
  },
  revision: {
    head: 'a'.repeat(40),
    runtimeRevision: 'b'.repeat(40),
    treeHashes: { src: 'c'.repeat(40) },
    dirty: false,
    packageJsonDigest: 'd'.repeat(64),
  },
  machine: {
    cpuModel: 'Test CPU',
    cores: 8,
    governor: 'powersave',
    kernel: '6.18.0',
    memoryTotalKb: 1000,
  },
  placement: {
    cpus: [0, 1],
    source: 'hybrid-cpu-core',
    pinned: true,
    tasksetPath: '/usr/bin/taskset',
  },
  scenarios: {
    idle: { ...measured },
    typingUnderFlood: { latencyMs: [40, 10, 30, 20], completionMs: [5], ...measured },
    busyScroll: { latencyMs: [7], ...measured },
    hiddenOutput: { completionMs: [9], ...measured },
    resizeBurst: { latencyMs: [3, 4], ...measured },
    paneList: { latencyMs: [2], controlMs: [1], ...measured },
  },
  gaps: [] as { scenario: string; metric: string; reason: string }[],
});

type CompareFixture = ReturnType<typeof compareFixture>;

const summarySchema = z.object({
  count: z.number(),
  min: z.number(),
  median: z.number(),
  p95: z.number(),
  max: z.number(),
});

const compareOutputSchema = z.object({
  reported: z.array(z.object({ field: z.string() })),
  scenarios: z.record(
    z.string(),
    z.record(z.string(), z.array(z.union([summarySchema, z.number(), z.null()]))),
  ),
});

const runCompare = async (first: CompareFixture, second: CompareFixture, ...flags: string[]) => {
  const directory = await temporaryDirectory();
  const firstPath = join(directory, 'first.json');
  const secondPath = join(directory, 'second.json');

  await writeFile(firstPath, JSON.stringify(first));
  await writeFile(secondPath, JSON.stringify(second));

  const child = Bun.spawn(
    [
      process.execPath,
      join(root, 'scripts/benchmark.ts'),
      '--compare',
      firstPath,
      secondPath,
      ...flags,
    ],
    { cwd: root, env: process.env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
};

it('refuses to compare runs when one lacks a metric without a gap', async () => {
  const first = compareFixture();
  const second = compareFixture();

  delete (second.scenarios.typingUnderFlood as { latencyMs?: number[] }).latencyMs;

  const compared = await runCompare(first, second);

  expect(compared.exitCode).not.toBe(0);
  expect(compared.stderr).toContain('typingUnderFlood.latencyMs');
  expect(compared.stdout).toBe('');
});

it('refuses to compare runs with different configurations and names the field', async () => {
  const first = compareFixture();
  const second = compareFixture();

  second.configuration.columns = 120;
  second.machine.kernel = '6.19.0';
  second.placement.pinned = false;

  const compared = await runCompare(first, second);

  expect(compared.exitCode).not.toBe(0);
  expect(compared.stderr).toContain('configuration.columns');
  expect(compared.stderr).toContain('machine.kernel');
  expect(compared.stderr).toContain('placement.pinned');
  expect(compared.stdout).toBe('');
});

it('refuses runs that both lack a required metric without a gap', async () => {
  const first = compareFixture();
  const second = compareFixture();

  for (const result of [first, second]) {
    delete (result.scenarios.busyScroll as { latencyMs?: number[] }).latencyMs;
    delete (result.scenarios.idle as { guests?: unknown }).guests;
  }

  const compared = await runCompare(first, second);

  expect(compared.exitCode).not.toBe(0);
  expect(compared.stderr).toContain('scenarios.busyScroll.latencyMs');
  expect(compared.stderr).toContain('scenarios.idle.guests');
  expect(compared.stdout).toBe('');
});

it('refuses a file that does not have the result shape', async () => {
  const first = compareFixture();
  const second = compareFixture();

  delete (second.scenarios as { paneList?: unknown }).paneList;

  const compared = await runCompare(first, second);

  expect(compared.exitCode).not.toBe(0);
  expect(compared.stderr).toContain('paneList');
});

it('summarizes matching runs per scenario and metric with nearest-rank percentiles', async () => {
  const first = compareFixture();
  const second = compareFixture();

  second.run = {
    root: '/repository/',
    runFolder: '/tmp/koja-bench-second',
    startTime: '2026-10-26T10:00:00.000Z',
    endTime: '2026-10-26T10:01:00.000Z',
    bunVersion: '1.5.0',
  };

  second.revision.head = 'e'.repeat(40);
  second.machine.governor = 'performance';

  second.scenarios.typingUnderFlood.latencyMs = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100,
  ];

  second.scenarios.idle.client = resources(15);

  const compared = await runCompare(first, second, '--json');

  expect({ exitCode: compared.exitCode, stderr: compared.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  const output = compareOutputSchema.parse(JSON.parse(compared.stdout));

  expect(output.scenarios.typingUnderFlood?.latencyMs).toEqual([
    { count: 4, min: 10, median: 20, p95: 40, max: 40 },
    { count: 20, min: 1, median: 10, p95: 19, max: 100 },
  ]);

  expect(output.scenarios.paneList?.controlMs).toEqual([
    { count: 1, min: 1, median: 1, p95: 1, max: 1 },
    { count: 1, min: 1, median: 1, p95: 1, max: 1 },
  ]);

  expect(output.scenarios.idle?.['client.cpuMs']).toEqual([10, 15]);
  expect(output.scenarios.idle?.['guests.memoryBytes.lifetimePeak']).toEqual([4096, 4096]);

  expect(output.reported.map((entry) => entry.field).toSorted()).toEqual(
    [
      'machine.governor',
      'revision.head',
      'run.bunVersion',
      'run.endTime',
      'run.runFolder',
      'run.startTime',
    ].toSorted(),
  );
});

it('compares runs when the run lacking a metric names it in its gaps', async () => {
  const first = compareFixture();
  const second = compareFixture();

  delete (second.scenarios.busyScroll as { latencyMs?: number[] }).latencyMs;

  second.gaps.push({
    scenario: 'busyScroll',
    metric: 'latencyMs',
    reason: 'The screen never scrolled.',
  });

  const compared = await runCompare(first, second, '--json');

  expect({ exitCode: compared.exitCode, stderr: compared.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  const output = compareOutputSchema.parse(JSON.parse(compared.stdout));

  expect(output.scenarios.busyScroll?.latencyMs).toEqual([
    { count: 1, min: 7, median: 7, p95: 7, max: 7 },
    null,
  ]);
});

it('prints a readable summary of both runs by default', async () => {
  const compared = await runCompare(compareFixture(), compareFixture());

  expect({ exitCode: compared.exitCode, stderr: compared.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  expect(compared.stdout).toContain('typingUnderFlood');
  expect(compared.stdout).toContain('latencyMs');
});

it('stops waiting for server readiness after its time limit when the server prints nothing', async () => {
  let cancelled = false;

  const silent = new ReadableStream<Uint8Array>({
    cancel: () => {
      cancelled = true;
    },
  });

  const waited = readServerReadiness(1, silent, 50).then(
    () => 'ready',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

  expect(await waited).toContain('did not report readiness in time');
  expect(cancelled).toBe(true);
});

const parentOf = (processId: string): number | undefined => {
  try {
    const stat = readFileSync(`/proc/${processId}/stat`, 'utf8');

    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
  } catch {
    return undefined;
  }
};

const commandLineOf = (processId: string): string => {
  try {
    return readFileSync(`/proc/${processId}/cmdline`, 'utf8').replaceAll('\0', ' ');
  } catch {
    return '';
  }
};

const startingServerOf = (
  benchmarkProcessId: number,
): { pid: number; folder: string } | undefined => {
  for (const name of readdirSync('/proc')) {
    const folder = /server run --socket (\S+)\/run\/koja\.sock/.exec(commandLineOf(name))?.[1];

    if (folder !== undefined && parentOf(name) === benchmarkProcessId) {
      return { pid: Number(name), folder };
    }
  }

  return undefined;
};

it('stops the server and removes the run folder on an interrupt before the server is ready', async () => {
  const benchmark = Bun.spawn(
    [process.execPath, join(root, 'scripts/benchmark.ts'), '--samples', '1', '--duration-ms', '10'],
    { cwd: root, env: process.env, stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' },
  );

  let server: { pid: number; folder: string } | undefined;

  try {
    const found = await waitFor(() => {
      server = startingServerOf(benchmark.pid);

      return server !== undefined;
    }, 30_000);

    expect(found).toBe(true);

    // A stopped server cannot report readiness, so the interrupt lands in start-up.
    process.kill(server?.pid ?? 0, 'SIGSTOP');
    benchmark.kill('SIGINT');

    expect(await benchmark.exited).not.toBe(0);
    expect(isRunning(server?.pid ?? 0)).toBe(false);
    expect(existsSync(server?.folder ?? '')).toBe(false);
  } finally {
    benchmark.kill('SIGKILL');

    if (server !== undefined && isRunning(server.pid)) {
      process.kill(server.pid, 'SIGKILL');
      process.kill(server.pid, 'SIGCONT');
    }

    if (server !== undefined) {
      await rm(server.folder, { recursive: true, force: true });
    }
  }
}, 60_000);
