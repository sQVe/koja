import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { placementCommand } from './benchmarkMachine.ts';
import type { Placement } from './benchmarkMachine.ts';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunFolder {
  folder: string;
  socketPath: string;
  workFolder: string;
}

export interface BenchmarkPanes {
  visible: string[];
  focused: string;
  hidden: string;
  visibleTab: string;
}

export interface BenchmarkServer {
  ready: Promise<number>;
  stop: () => Promise<void>;
}

export type KojaRunner = (...commandArguments: string[]) => Promise<CliResult>;

export const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

const serverReadyTimeoutMs = 15_000;

const stopGraceMs = 5_000;

const earlyExitGraceMs = 1_000;

const runningSchema = z.object({ socket: z.string(), pid: z.number().int().positive() });

const paneListSchema = z.array(
  z.object({ id: z.string(), tab: z.string(), lifecycle: z.string(), focused: z.boolean() }),
);

const paneDoneSchema = z.object({ pane: z.string() });

const tabDoneSchema = z.object({ tab: z.string() });

const workspaceDoneSchema = z.object({ workspace: z.string() });

export const createRunFolder = async (): Promise<RunFolder> => {
  const folder = await mkdtemp(join(tmpdir(), 'koja-bench-'));
  const socketPath = join(folder, 'run', 'koja.sock');

  if (existsSync(socketPath)) {
    throw new Error(`The isolated socket ${socketPath} already exists.`);
  }

  await mkdir(join(folder, 'work'));

  return { folder, socketPath, workFolder: join(folder, 'work') };
};

export const removeRunFolder = async (folder: string): Promise<void> => {
  await rm(folder, { recursive: true, force: true });
};

export const isolatedEnvironment = (folder: string): Record<string, string | undefined> => {
  const environment: Record<string, string | undefined> = {};

  // oxlint-disable-next-line node/no-process-env -- The benchmark starts from the user environment.
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('KOJA_')) {
      environment[name] = value;
    }
  }

  // oxlint-disable-next-line node/no-process-env -- systemd discovers its manager through it.
  const userRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
  const runtimeDirectory = join(folder, 'runtime');

  environment.XDG_STATE_HOME = join(folder, 'state');
  environment.XDG_RUNTIME_DIR = runtimeDirectory;
  environment.SHELL = '/bin/sh';
  environment.PS1 = '';

  const managerSocket =
    userRuntimeDirectory === undefined
      ? undefined
      : join(userRuntimeDirectory, 'systemd', 'private');

  if (managerSocket !== undefined && existsSync(managerSocket)) {
    mkdirSync(join(runtimeDirectory, 'systemd'), { recursive: true });
    symlinkSync(managerSocket, join(runtimeDirectory, 'systemd', 'private'));
  }

  return environment;
};

export const runProcess = async (
  command: string[],
  cwd: string,
  environment: Record<string, string | undefined>,
): Promise<CliResult> => {
  const child = Bun.spawn(command, {
    cwd,
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
};

export const kojaArguments = (commandArguments: string[], socketPath: string): string[] => [
  ...commandArguments,
  '--socket',
  socketPath,
];

export const serverArguments = (socketPath: string): string[] => [
  'server',
  'run',
  '--socket',
  socketPath,
  '--json',
];

export const attachArguments = (socketPath: string): string[] => ['attach', '--socket', socketPath];

export const createCliRunner =
  (folder: string, environment: Record<string, string | undefined>, placement: Placement) =>
  (...commandArguments: string[]): Promise<CliResult> =>
    runProcess(
      placementCommand(placement, [
        process.execPath,
        join(repositoryRoot, 'src/index.ts'),
        ...commandArguments,
      ]),
      folder,
      environment,
    );

export const createKojaRunner = (
  folder: string,
  socketPath: string,
  environment: Record<string, string | undefined>,
  placement: Placement,
): KojaRunner => {
  const cli = createCliRunner(folder, environment, placement);

  return (...commandArguments) => cli(...kojaArguments(commandArguments, socketPath));
};

const failOnCli = (result: CliResult, description: string): void => {
  if (result.exitCode !== 0) {
    throw new Error(
      `${description} exited ${result.exitCode}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
};

const parseJson = <Value>(schema: z.ZodType<Value>, text: string, description: string): Value => {
  const parsed = schema.safeParse(JSON.parse(text));

  if (!parsed.success) {
    throw new Error(`${description} printed an unexpected result: ${parsed.error.message}`);
  }

  return parsed.data;
};

const readBefore = async <Value>(
  read: Promise<Value>,
  deadline: number,
  processId: number,
): Promise<Value> => {
  const expired = Promise.withResolvers<never>();

  const timer = setTimeout(
    () => {
      expired.reject(new Error(`Server ${processId} did not report readiness in time.`));
    },
    Math.max(deadline - performance.now(), 0),
  );

  try {
    return await Promise.race([read, expired.promise]);
  } finally {
    clearTimeout(timer);
  }
};

export const readServerReadiness = async (
  processId: number,
  stdout: ReadableStream<Uint8Array>,
  timeoutMs: number,
): Promise<string> => {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  const deadline = performance.now() + timeoutMs;

  while (!buffered.includes('\n')) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each read follows the last one.
    const chunk = await readBefore(reader.read(), deadline, processId).catch(
      async (error: unknown) => {
        await reader.cancel().catch(() => undefined);

        throw error;
      },
    );

    if (chunk.done) {
      throw new Error(`Server ${processId} closed stdout before it reported readiness.`);
    }

    buffered += decoder.decode(chunk.value, { stream: true });
  }

  const rest = async (): Promise<void> => {
    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each read follows the last one.
      const chunk = await reader.read();

      if (chunk.done) {
        return;
      }
    }
  };

  rest().catch(() => undefined);

  return buffered.slice(0, buffered.indexOf('\n'));
};

export const startBenchmarkServer = (
  folder: RunFolder,
  environment: Record<string, string | undefined>,
  placement: Placement,
): BenchmarkServer => {
  const command = placementCommand(placement, [
    process.execPath,
    join(repositoryRoot, 'src/index.ts'),
    ...serverArguments(folder.socketPath),
  ]);

  const child = Bun.spawn(command, {
    cwd: folder.folder,
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let stderrText = '';

  const stderrDone = new Response(child.stderr)
    .text()
    .then((text) => {
      stderrText = text;

      return undefined;
    })
    .catch(() => undefined);

  const kill = async (): Promise<void> => {
    child.kill('SIGKILL');
    await child.exited;
    await stderrDone;
  };

  const waitForReady = async (): Promise<number> => {
    let line: string;

    try {
      line = await readServerReadiness(child.pid, child.stdout, serverReadyTimeoutMs);
    } catch (error) {
      const exited = await Promise.race([
        child.exited.then(() => true),
        Bun.sleep(earlyExitGraceMs).then(() => false),
      ]);

      if (!exited) {
        await kill();
      }

      await stderrDone;

      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\nstderr:\n${stderrText}`,
        { cause: error },
      );
    }

    const parsed = runningSchema.safeParse(JSON.parse(line));

    if (!parsed.success) {
      await kill();

      throw new Error(`The server printed an unexpected readiness line: ${line}`);
    }

    return parsed.data.pid;
  };

  const terminate = async (): Promise<void> => {
    child.kill('SIGTERM');

    const exited = await Promise.race([
      child.exited.then(() => true),
      Bun.sleep(stopGraceMs).then(() => false),
    ]);

    if (!exited) {
      await kill();
    }

    await stderrDone;
  };

  let stopping: Promise<void> | undefined;

  const stop = (): Promise<void> => {
    stopping ??= terminate();

    return stopping;
  };

  return { ready: waitForReady(), stop };
};

const listPanes = async (koja: KojaRunner): Promise<z.infer<typeof paneListSchema>> => {
  const listed = await koja('pane', 'list', '--json');

  failOnCli(listed, 'pane list');

  return parseJson(paneListSchema, listed.stdout, 'pane list');
};

const splitPane = async (koja: KojaRunner, pane: string, direction: string): Promise<string> => {
  const split = await koja('pane', 'split', pane, '--direction', direction, '--json');

  failOnCli(split, `pane split ${pane}`);

  return parseJson(paneDoneSchema, split.stdout, 'pane split').pane;
};

export const createBenchmarkPanes = async (
  koja: KojaRunner,
  workFolder: string,
): Promise<BenchmarkPanes> => {
  const created = await koja('workspace', 'create', workFolder, '--focus', '--json');

  failOnCli(created, 'workspace create');
  parseJson(workspaceDoneSchema, created.stdout, 'workspace create');

  const [first] = await listPanes(koja);

  if (first === undefined) {
    throw new Error('The workspace reported no pane.');
  }

  const second = await splitPane(koja, first.id, 'below');
  const third = await splitPane(koja, second, 'right');
  const fourth = await splitPane(koja, first.id, 'right');
  const focused = await koja('pane', 'focus', first.id, '--json');

  failOnCli(focused, 'pane focus');

  const hiddenTab = await koja('tab', 'create', '--no-focus', '--json');

  failOnCli(hiddenTab, 'tab create');

  const hiddenTabId = parseJson(tabDoneSchema, hiddenTab.stdout, 'tab create').tab;
  const panes = await listPanes(koja);
  const hidden = panes.find((pane) => pane.tab === hiddenTabId);

  if (hidden === undefined) {
    throw new Error(`The hidden tab ${hiddenTabId} reported no pane.`);
  }

  return {
    visible: [first.id, second, third, fourth],
    focused: first.id,
    hidden: hidden.id,
    visibleTab: first.tab,
  };
};
