import { expect, it, spyOn } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createReadRunner, readClipboard } from './clipboardRead.ts';

type ToolResult = Awaited<ReturnType<ReturnType<typeof createReadRunner>>>;

const read = async (
  environment: Record<string, string>,
  results: Record<string, ToolResult>,
  signal?: AbortSignal,
) => {
  const ran: string[] = [];

  const result = await readClipboard({
    environment,
    runCommand: (command) => {
      ran.push(command.join(' '));

      return Promise.resolve(results[command[0] ?? ''] ?? { ok: false, reason: 'failed' });
    },
    ...(signal === undefined ? {} : { signal }),
  });

  return { result, ran };
};

it('returns unsupported over SSH without running a tool', async () => {
  const { result, ran } = await read(
    { SSH_CONNECTION: '1 2 3 4', WAYLAND_DISPLAY: 'w', DISPLAY: ':0' },
    { 'wl-paste': { ok: true, text: 'hi' } },
  );

  expect(result).toEqual({ ok: false, reason: 'unsupported' });
  expect(ran).toEqual([]);
});

it('treats SSH_TTY as SSH', async () => {
  const { result, ran } = await read(
    { SSH_TTY: '/dev/pts/1', DISPLAY: ':0' },
    { xclip: { ok: true, text: 'hi' } },
  );

  expect(result).toEqual({ ok: false, reason: 'unsupported' });
  expect(ran).toEqual([]);
});

it('returns unsupported when no display is set', async () => {
  const { result, ran } = await read({}, { xclip: { ok: true, text: 'hi' } });

  expect(result).toEqual({ ok: false, reason: 'unsupported' });
  expect(ran).toEqual([]);
});

it('returns unsupported when the display variables are empty', async () => {
  const { result, ran } = await read(
    { WAYLAND_DISPLAY: '', DISPLAY: '' },
    { 'wl-paste': { ok: true, text: 'hi' }, xclip: { ok: true, text: 'hi' } },
  );

  expect(result).toEqual({ ok: false, reason: 'unsupported' });
  expect(ran).toEqual([]);
});

it('reads with wl-paste on Wayland and stops when it succeeds', async () => {
  const { result, ran } = await read(
    { WAYLAND_DISPLAY: 'wayland-1', DISPLAY: ':0' },
    { 'wl-paste': { ok: true, text: 'hi\n' }, xclip: { ok: true, text: 'other' } },
  );

  expect(result).toEqual({ ok: true, text: 'hi\n' });
  expect(ran).toEqual(['wl-paste --no-newline --type text/plain']);
});

it('falls back to xclip on X11 when wl-paste fails', async () => {
  const { result, ran } = await read(
    { WAYLAND_DISPLAY: 'wayland-1', DISPLAY: ':0' },
    { xclip: { ok: true, text: 'hi' } },
  );

  expect(result).toEqual({ ok: true, text: 'hi' });

  expect(ran).toEqual([
    'wl-paste --no-newline --type text/plain',
    'xclip -selection clipboard -out',
  ]);
});

it('falls back to xsel when xclip fails', async () => {
  const { result, ran } = await read({ DISPLAY: ':0' }, { xsel: { ok: true, text: 'hi' } });

  expect(result).toEqual({ ok: true, text: 'hi' });
  expect(ran).toEqual(['xclip -selection clipboard -out', 'xsel --clipboard --output']);
});

it('returns failed when every tool fails', async () => {
  const { result, ran } = await read({ WAYLAND_DISPLAY: 'wayland-1', DISPLAY: ':0' }, {});

  expect(result).toEqual({ ok: false, reason: 'failed' });

  expect(ran).toEqual([
    'wl-paste --no-newline --type text/plain',
    'xclip -selection clipboard -out',
    'xsel --clipboard --output',
  ]);
});

it('returns empty when the winning tool prints nothing', async () => {
  const { result, ran } = await read(
    { DISPLAY: ':0' },
    { xclip: { ok: true, text: '' }, xsel: { ok: true, text: 'hi' } },
  );

  expect(result).toEqual({ ok: false, reason: 'empty' });
  expect(ran).toEqual(['xclip -selection clipboard -out']);
});

it('tries the next tool after a timeout and returns timeout when none succeeds', async () => {
  const { result, ran } = await read(
    { DISPLAY: ':0' },
    { xclip: { ok: false, reason: 'timeout' } },
  );

  expect(result).toEqual({ ok: false, reason: 'timeout' });
  expect(ran).toEqual(['xclip -selection clipboard -out', 'xsel --clipboard --output']);
});

it('returns the text of a later tool after an earlier one timed out', async () => {
  const { result } = await read(
    { DISPLAY: ':0' },
    { xclip: { ok: false, reason: 'timeout' }, xsel: { ok: true, text: 'hi' } },
  );

  expect(result).toEqual({ ok: true, text: 'hi' });
});

it('returns aborted without trying later tools', async () => {
  const { result, ran } = await read(
    { WAYLAND_DISPLAY: 'wayland-1', DISPLAY: ':0' },
    { 'wl-paste': { ok: false, reason: 'aborted' }, xclip: { ok: true, text: 'hi' } },
  );

  expect(result).toEqual({ ok: false, reason: 'aborted' });
  expect(ran).toEqual(['wl-paste --no-newline --type text/plain']);
});

const toolDirectory = async (scripts: Record<string, string>): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-clipboard-read-'));

  for (const [name, body] of Object.entries(scripts)) {
    const path = join(directory, name);

    await writeFile(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
  }

  return directory;
};

const withTools = async <Result>(directory: string, body: () => Promise<Result>) => {
  try {
    return await body();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

const expectDead = async (pid: number): Promise<void> => {
  const deadline = performance.now() + 5000;

  while (processAlive(pid) && performance.now() < deadline) {
    await Bun.sleep(5);
  }

  expect(processAlive(pid)).toBe(false);
};

const waitForFile = async (path: string): Promise<void> => {
  const deadline = performance.now() + 5000;

  while (!(await Bun.file(path).exists()) && performance.now() < deadline) {
    await Bun.sleep(5);
  }
};

const runnerFor = (directory: string, timeoutMs: number) =>
  createReadRunner({
    toolTimeoutMs: timeoutMs,
    searchPath: `${directory}:${process.env.PATH ?? ''}`,
  });

it('kills a tool that hangs past the timeout and reads with the next tool', async () => {
  const directory = await toolDirectory({
    xclip: 'echo $$ > "$0.pid"\nexec sleep 30',
    xsel: 'printf "from xsel"',
  });

  await withTools(directory, async () => {
    const result = await readClipboard({
      environment: { DISPLAY: ':0' },
      runCommand: runnerFor(directory, 100),
    });

    expect(result).toEqual({ ok: true, text: 'from xsel' });
    await expectDead(Number(await Bun.file(join(directory, 'xclip.pid')).text()));
  });
});

it('returns timeout when every tool hangs', async () => {
  const directory = await toolDirectory({ xclip: 'exec sleep 30', xsel: 'exec sleep 30' });

  const result = await withTools(directory, () =>
    readClipboard({ environment: { DISPLAY: ':0' }, runCommand: runnerFor(directory, 50) }),
  );

  expect(result).toEqual({ ok: false, reason: 'timeout' });
});

it('returns the output of a real tool that exits zero', async () => {
  const directory = await toolDirectory({ 'wl-paste': 'printf "one\\ntwo"' });

  const result = await withTools(directory, () =>
    readClipboard({
      environment: { WAYLAND_DISPLAY: 'w' },
      runCommand: runnerFor(directory, 2000),
    }),
  );

  expect(result).toEqual({ ok: true, text: 'one\ntwo' });
});

it('returns failed when real tools exit nonzero or are missing', async () => {
  const directory = await toolDirectory({ xclip: 'printf "partial"\nexit 1' });

  const runner = createReadRunner({ toolTimeoutMs: 2000, searchPath: directory });

  const result = await withTools(directory, () =>
    readClipboard({ environment: { DISPLAY: ':0' }, runCommand: runner }),
  );

  expect(result).toEqual({ ok: false, reason: 'failed' });
});

it('reports a missing tool and a nonzero exit as failed from the runner', async () => {
  const directory = await toolDirectory({ xclip: 'printf "partial"\nexit 1' });
  const runner = createReadRunner({ toolTimeoutMs: 2000, searchPath: directory });

  const results = await withTools(directory, async () => [
    await runner(['xclip', '-selection', 'clipboard', '-out']),
    await runner(['xsel', '--clipboard', '--output']),
  ]);

  expect(results).toEqual([
    { ok: false, reason: 'failed' },
    { ok: false, reason: 'failed' },
  ]);
});

it('kills the running tool on abort and returns aborted', async () => {
  const directory = await toolDirectory({
    xclip: 'echo $$ > "$0.pid"\nexec sleep 30',
    xsel: 'echo ran > "$0.out"',
  });

  const controller = new AbortController();

  await withTools(directory, async () => {
    const pending = readClipboard({
      environment: { DISPLAY: ':0' },
      runCommand: runnerFor(directory, 30_000),
      signal: controller.signal,
    });

    const pidPath = join(directory, 'xclip.pid');

    await waitForFile(pidPath);
    controller.abort();

    expect(await pending).toEqual({ ok: false, reason: 'aborted' });
    expect(await Bun.file(join(directory, 'xsel.out')).exists()).toBe(false);
    await expectDead(Number(await Bun.file(pidPath).text()));
  });
});

it('returns aborted without running a tool when already aborted', async () => {
  const directory = await toolDirectory({ xclip: 'echo ran > "$0.out"' });
  const controller = new AbortController();

  controller.abort();

  await withTools(directory, async () => {
    const result = await readClipboard({
      environment: { DISPLAY: ':0' },
      runCommand: runnerFor(directory, 2000),
      signal: controller.signal,
    });

    expect(result).toEqual({ ok: false, reason: 'aborted' });
    expect(await Bun.file(join(directory, 'xclip.out')).exists()).toBe(false);
  });
});

const ignoresTerm = 'trap "" TERM\necho $$ > "$0.pid"\nwhile :; do sleep 1; done';

it('kills a tool that ignores SIGTERM before returning timeout', async () => {
  const directory = await toolDirectory({ xclip: ignoresTerm });

  await withTools(directory, async () => {
    const result = await runnerFor(directory, 100)(['xclip']);
    const pid = Number(await Bun.file(join(directory, 'xclip.pid')).text());

    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(processAlive(pid)).toBe(false);
  });
});

it('kills a tool that ignores SIGTERM before returning aborted', async () => {
  const directory = await toolDirectory({ xclip: ignoresTerm });
  const controller = new AbortController();

  await withTools(directory, async () => {
    const pending = runnerFor(directory, 30_000)(['xclip'], controller.signal);
    const pidPath = join(directory, 'xclip.pid');

    await waitForFile(pidPath);
    controller.abort();

    const result = await pending;
    const pid = Number(await Bun.file(pidPath).text());

    expect(result).toEqual({ ok: false, reason: 'aborted' });
    expect(processAlive(pid)).toBe(false);
  });
});

it('ends the tool group when the tool exits and returns its text', async () => {
  const directory = await toolDirectory({
    xclip: 'sleep 30 &\necho $! > "$0.child"\nprintf before\nexit 0',
  });

  await withTools(directory, async () => {
    const result = await runnerFor(directory, 30_000)(['xclip']);

    expect(result).toEqual({ ok: true, text: 'before' });
    await expectDead(Number(await Bun.file(join(directory, 'xclip.child')).text()));
  });
});

const leavesEscapedHolder = [
  'setsid sh -c \'echo $$ > "$1"; exec sleep 30\' holder "$0.holder" &',
  'while [ ! -s "$0.holder" ]; do sleep 0.01; done',
  'exit 0',
].join('\n');

const withEscapedHolder = async (body: (directory: string) => Promise<void>): Promise<void> => {
  const directory = await toolDirectory({ xclip: leavesEscapedHolder });
  const holderPath = join(directory, 'xclip.holder');

  await withTools(directory, async () => {
    try {
      await body(directory);
    } finally {
      await waitForFile(holderPath);
      process.kill(Number(await Bun.file(holderPath).text()), 'SIGKILL');
    }
  });
};

it('returns timeout when a process outside the tool group keeps stdout open', async () => {
  await withEscapedHolder(async (directory) => {
    const started = performance.now();
    const result = await runnerFor(directory, 100)(['xclip']);
    const elapsedMs = performance.now() - started;

    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(elapsedMs).toBeLessThan(1000);
  });
});

it('returns aborted when a process outside the tool group keeps stdout open', async () => {
  await withEscapedHolder(async (directory) => {
    const controller = new AbortController();
    const pending = runnerFor(directory, 30_000)(['xclip'], controller.signal);

    await waitForFile(join(directory, 'xclip.holder'));
    controller.abort();

    expect(await pending).toEqual({ ok: false, reason: 'aborted' });
  });
});

it('stops the running tool and returns failed when reading its output fails', async () => {
  const directory = await toolDirectory({ xclip: 'exec sleep 30' });
  const spawnProcess = Bun.spawn.bind(Bun) as (...options: unknown[]) => Bun.Subprocess;

  const failingOutput = new ReadableStream({
    start: (controller) => {
      controller.error(new Error('pipe read failed'));
    },
  });

  const spawned: Bun.Subprocess[] = [];

  const spawn = spyOn(Bun, 'spawn').mockImplementation(((...options: unknown[]) => {
    const tool = spawnProcess(...options);

    spawned.push(tool);

    return {
      pid: tool.pid,
      get exitCode() {
        return tool.exitCode;
      },
      get signalCode() {
        return tool.signalCode;
      },
      exited: tool.exited,
      stdout: failingOutput,
    };
  }) as typeof Bun.spawn);

  const result = await withTools(directory, async () => {
    try {
      return await runnerFor(directory, 30_000)(['xclip']);
    } finally {
      spawn.mockRestore();
    }
  });

  expect(result).toEqual({ ok: false, reason: 'failed' });
  expect(spawned.map((tool) => processAlive(tool.pid))).toEqual([false]);
});

it('returns failed when the tool cannot start', async () => {
  const directory = await toolDirectory({});

  await writeFile(join(directory, 'xclip'), '#!/nonexistent/interpreter\n', { mode: 0o755 });

  const result = await withTools(directory, () => runnerFor(directory, 2000)(['xclip']));

  expect(result).toEqual({ ok: false, reason: 'failed' });
});

it('runs a tool with the client PATH when no search path is given', async () => {
  const directory = await toolDirectory({ 'print-path': 'printf %s "$PATH"' });

  const result = await withTools(directory, () =>
    createReadRunner()([join(directory, 'print-path')]),
  );

  expect(result).toEqual({ ok: true, text: process.env.PATH ?? '' });
});
