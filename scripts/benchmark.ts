import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { ghosttyCommit } from '../src/vt/vt.ts';
import { attachBenchmarkClient } from './benchmarkClient.ts';
import type { BenchmarkClient } from './benchmarkClient.ts';
import { runCompare } from './benchmarkCompare.ts';
import { detectPlacement, machineFacts } from './benchmarkMachine.ts';
import type { Placement } from './benchmarkMachine.ts';
import type { ScenarioContext } from './benchmarkMeasure.ts';
import { resultSchema } from './benchmarkResult.ts';
import type {
  BenchmarkConfiguration,
  BenchmarkResult,
  ResultGap,
  ScenarioMeasurement,
} from './benchmarkResult.ts';
import { dirtyRuntimePaths, readRevision, runtimePaths } from './benchmarkRevision.ts';
import type { Revision } from './benchmarkRevision.ts';
import { guestCommandTemplates, scenarioNames, scenarioRunners } from './benchmarkScenarios.ts';
import type { ScenarioName } from './benchmarkScenarios.ts';
import {
  attachArguments,
  createBenchmarkPanes,
  createKojaRunner,
  createRunFolder,
  isolatedEnvironment,
  kojaArguments,
  removeRunFolder,
  repositoryRoot,
  serverArguments,
  startBenchmarkServer,
} from './benchmarkServer.ts';
import type { BenchmarkPanes, KojaRunner, RunFolder } from './benchmarkServer.ts';
import { typedInputTemplates } from './benchmarkTyping.ts';

interface BenchmarkOptions {
  output: string | undefined;
  columns: number;
  rows: number;
  samples: number;
  idleDurationMs: number;
  floodBytes: number;
  resizeCount: number;
}

type ParseResult = { ok: true; options: BenchmarkOptions } | { ok: false; message: string };

const defaultColumns = 200;

const defaultRows = 50;

const defaultSamples = 20;

const defaultIdleDurationMs = 2_000;

const defaultFloodBytes = 8_000_000;

const defaultResizeCount = 8;

const signalExitCodes = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;

const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

const commandOptions = {
  output: { type: 'string' },
  columns: { type: 'string' },
  rows: { type: 'string' },
  samples: { type: 'string' },
  'duration-ms': { type: 'string' },
  'flood-bytes': { type: 'string' },
  'resize-count': { type: 'string' },
} as const;

const positiveInteger = (name: string, value: string | undefined, fallback: number) => {
  if (value === undefined) {
    return fallback;
  }

  if (!/^[1-9][0-9]*$/.test(value)) {
    return `${name} takes a positive whole number.`;
  }

  return Number(value);
};

const parseOptions = (args: string[]): ParseResult => {
  let values: Record<string, string | undefined>;

  try {
    values = parseArgs({
      args,
      options: commandOptions,
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  const columns = positiveInteger('--columns', values.columns, defaultColumns);

  if (typeof columns === 'string') {
    return { ok: false, message: columns };
  }

  const rows = positiveInteger('--rows', values.rows, defaultRows);

  if (typeof rows === 'string') {
    return { ok: false, message: rows };
  }

  const samples = positiveInteger('--samples', values.samples, defaultSamples);

  if (typeof samples === 'string') {
    return { ok: false, message: samples };
  }

  const idleDurationMs = positiveInteger(
    '--duration-ms',
    values['duration-ms'],
    defaultIdleDurationMs,
  );

  if (typeof idleDurationMs === 'string') {
    return { ok: false, message: idleDurationMs };
  }

  const floodBytes = positiveInteger('--flood-bytes', values['flood-bytes'], defaultFloodBytes);

  if (typeof floodBytes === 'string') {
    return { ok: false, message: floodBytes };
  }

  const resizeCount = positiveInteger('--resize-count', values['resize-count'], defaultResizeCount);

  if (typeof resizeCount === 'string') {
    return { ok: false, message: resizeCount };
  }

  return {
    ok: true,
    options: {
      output: values.output,
      columns,
      rows,
      samples,
      idleDurationMs,
      floodBytes,
      resizeCount,
    },
  };
};

const runScenarios = async (
  context: ScenarioContext,
): Promise<{
  scenarios: Partial<Record<ScenarioName, ScenarioMeasurement>>;
  gaps: ResultGap[];
}> => {
  const scenarios: Partial<Record<ScenarioName, ScenarioMeasurement>> = {};
  const gaps: ResultGap[] = [];

  for (const name of scenarioNames) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one scenario finishes before the next starts.
    const { gaps: scenarioGaps, ...measurement } = await scenarioRunners[name](context);

    scenarios[name] = measurement;

    for (const gap of scenarioGaps) {
      gaps.push({ scenario: name, ...gap });
    }
  }

  return { scenarios, gaps };
};

const recordedSocket = '<run>/run/koja.sock';

const recordedCommand = (commandArguments: string[]): string =>
  ['bun <root>/src/index.ts', ...commandArguments].join(' ');

const recordedKoja = (...commandArguments: string[]): string =>
  recordedCommand(kojaArguments(commandArguments, recordedSocket));

const commands = (): BenchmarkConfiguration['commands'] => ({
  server: recordedCommand(serverArguments(recordedSocket)),
  attach: recordedCommand(attachArguments(recordedSocket)),
  workspaceCreate: recordedKoja('workspace', 'create', '<run>/work', '--focus', '--json'),
  paneSplit: [
    recordedKoja('pane', 'split', '<first-pane>', '--direction', 'below', '--json'),
    recordedKoja('pane', 'split', '<second-pane>', '--direction', 'right', '--json'),
    recordedKoja('pane', 'split', '<first-pane>', '--direction', 'right', '--json'),
  ],
  paneFocus: recordedKoja('pane', 'focus', '<first-pane>', '--json'),
  tabCreate: recordedKoja('tab', 'create', '--no-focus', '--json'),
  paneList: recordedKoja('pane', 'list', '--json'),
  version: recordedCommand(['--version']),
  paneRead: recordedKoja('pane', 'read', '<hidden-pane>', '--lines', '1000'),
});

const buildConfiguration = (
  options: BenchmarkOptions,
  panes: BenchmarkPanes,
  ghostty: string | undefined,
): BenchmarkConfiguration => {
  return {
    columns: options.columns,
    rows: options.rows,
    samples: options.samples,
    idleDurationMs: options.idleDurationMs,
    floodBytes: options.floodBytes,
    resizeCount: options.resizeCount,
    visiblePanes: 4,
    hiddenPanes: 1,
    ghosttyCommit: ghostty,
    commands: commands(),
    attachTerminal: { columns: options.columns, rows: options.rows },
    guestPlacement: 'inherited-from-server',
    guestCommands: guestCommandTemplates(options.floodBytes),
    typedInput: typedInputTemplates(),
    panes,
  };
};

const writeResult = async (result: BenchmarkResult, output: string | undefined): Promise<void> => {
  const text = `${JSON.stringify(result, null, 2)}\n`;

  if (output === undefined) {
    process.stdout.write(text);

    return;
  }

  await writeFile(output, text);
};

const setupFailureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const runBenchmark = async (
  folder: RunFolder,
  options: BenchmarkOptions,
  placement: Placement,
  revision: Revision,
  setStop: (stop: () => Promise<void>) => void,
): Promise<BenchmarkResult> => {
  const environment = isolatedEnvironment(folder.folder);
  const koja: KojaRunner = createKojaRunner(folder.folder, folder.socketPath, environment);
  const server = startBenchmarkServer(folder, environment, placement);
  let client: BenchmarkClient | undefined;

  setStop(async () => {
    await client?.stop();
    await server.stop();
  });

  try {
    const serverProcessId = await server.ready;
    const panes = await createBenchmarkPanes(koja, folder.workFolder);

    client = attachBenchmarkClient({
      socketPath: folder.socketPath,
      environment,
      placement,
      columns: options.columns,
      rows: options.rows,
    });

    await client.waitFor(
      () => (client?.text().split('\n').at(-1)?.trimEnd() ?? '').startsWith('INSERT'),
      'The client did not draw its status bar',
    );

    const startTime = new Date().toISOString();

    const { scenarios, gaps } = await runScenarios({
      folder: folder.folder,
      environment,
      serverProcessId,
      koja,
      client,
      panes,
      configuration: options,
    });

    const endTime = new Date().toISOString();
    const commit = ghosttyCommit();

    if (!commit.ok) {
      gaps.unshift({ scenario: 'all', metric: 'ghosttyCommit', reason: commit.detail });
    }

    if (placement.cpus !== undefined && !placement.pinned) {
      gaps.unshift({
        scenario: 'all',
        metric: 'placement',
        reason: placement.reason ?? 'The benchmark could not pin the run to fast CPUs.',
      });
    }

    // A result that does not match the schema is a bug in the run, so parsing throws.
    return resultSchema.parse({
      version: 1,
      run: {
        root: repositoryRoot,
        runFolder: folder.folder,
        startTime,
        endTime,
        bunVersion: Bun.version,
      },
      configuration: buildConfiguration(options, panes, commit.ok ? commit.commit : undefined),
      revision,
      machine: machineFacts(),
      placement,
      scenarios,
      gaps,
    });
  } finally {
    await client?.stop();
    await server.stop();
  }
};

const main = async (): Promise<number> => {
  const args = Bun.argv.slice(2);

  if (args[0] === '--compare') {
    return runCompare(args.slice(1));
  }

  const parsed = parseOptions(args);

  if (!parsed.ok) {
    process.stderr.write(`koja benchmark: ${parsed.message}\n`);

    return 2;
  }

  const dirty = dirtyRuntimePaths(repositoryRoot);

  if (dirty.length > 0) {
    const paths = dirty.map((path) => `  ${path}`).join('\n');

    process.stderr.write(
      `koja benchmark: the runtime paths have uncommitted changes:\n${paths}\n` +
        `Commit or revert them before measuring ${runtimePaths.join(', ')}.\n`,
    );

    return 1;
  }

  const revision = readRevision(repositoryRoot);
  const placement = detectPlacement();
  const folder = await createRunFolder();
  let stop: (() => Promise<void>) | undefined;

  const cleanup = async (): Promise<void> => {
    await stop?.();
    stop = undefined;
    await removeRunFolder(folder.folder);
  };

  const onSignal = (signal: (typeof signals)[number]): void => {
    const finish = async (): Promise<void> => {
      await cleanup().catch(() => undefined);
      process.exit(signalExitCodes[signal]);
    };

    finish().catch(() => undefined);
  };

  for (const signal of signals) {
    process.once(signal, onSignal);
  }

  try {
    const result = await runBenchmark(folder, parsed.options, placement, revision, (next) => {
      stop = next;
    });

    await cleanup();
    await writeResult(result, parsed.options.output);

    return 0;
  } catch (error) {
    await cleanup();
    process.stderr.write(`koja benchmark: ${setupFailureMessage(error)}\n`);

    return 1;
  } finally {
    for (const signal of signals) {
      process.removeListener(signal, onSignal);
    }
  }
};

const exitCode = await main();

process.exit(exitCode);
