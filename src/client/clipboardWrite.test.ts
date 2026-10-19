import { expect, it } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { copyToClipboard, createClipboardQueue, createCommandRunner } from './clipboardWrite.ts';

const base64Hi = Buffer.from('hi').toString('base64');
const osc52Hi = `\u001B]52;c;${base64Hi}\u0007`;

const copy = async (environment: Record<string, string>, working: string[]) => {
  const ran: string[] = [];
  const written: string[] = [];

  await copyToClipboard('hi', {
    environment,
    runCommand: (command, text) => {
      ran.push(`${command.join(' ')}<${text}`);

      return Promise.resolve(working.includes(command[0] ?? ''));
    },
    writeTerminal: (bytes) => {
      written.push(bytes);
    },
  });

  return { ran, written };
};

it('writes OSC 52 over SSH without trying a native tool', async () => {
  const result = await copy({ SSH_CONNECTION: '1 2 3 4', WAYLAND_DISPLAY: 'w', DISPLAY: ':0' }, [
    'wl-copy',
  ]);

  expect(result).toEqual({ ran: [], written: [osc52Hi] });
});

it('treats SSH_TTY as SSH', async () => {
  const result = await copy({ SSH_TTY: '/dev/pts/1', DISPLAY: ':0' }, ['xclip']);

  expect(result).toEqual({ ran: [], written: [osc52Hi] });
});

it('uses wl-copy on Wayland and stops when it succeeds', async () => {
  const result = await copy({ WAYLAND_DISPLAY: 'wayland-1', DISPLAY: ':0' }, ['wl-copy']);

  expect(result).toEqual({ ran: ['wl-copy --type text/plain;charset=utf-8<hi'], written: [] });
});

it('tries xclip, then xsel, on X11', async () => {
  const result = await copy({ DISPLAY: ':0' }, ['xsel']);

  expect(result).toEqual({
    ran: ['xclip -selection clipboard -in<hi', 'xsel --clipboard --input<hi'],
    written: [],
  });
});

it('falls through the native tools in order, then writes OSC 52', async () => {
  const result = await copy({ WAYLAND_DISPLAY: 'wayland-1', DISPLAY: ':0' }, []);

  expect(result.ran).toEqual([
    'wl-copy --type text/plain;charset=utf-8<hi',
    'xclip -selection clipboard -in<hi',
    'xsel --clipboard --input<hi',
  ]);

  expect(result.written).toEqual([osc52Hi]);
});

it('writes OSC 52 when no display is set', async () => {
  const result = await copy({}, ['wl-copy', 'xclip']);

  expect(result).toEqual({ ran: [], written: [osc52Hi] });
});

const toolDirectory = async (scripts: Record<string, string>): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'koja-clipboard-'));

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

it('kills a tool that does not exit in time and falls through to the next tool', async () => {
  const directory = await toolDirectory({
    xclip: 'echo $$ > "$0.pid"\nexec sleep 30',
    xsel: 'cat > "$0.out"',
  });

  const run = createCommandRunner({
    wlCopyStartupMs: 50,
    toolTimeoutMs: 100,
    searchPath: `${directory}:${process.env.PATH ?? ''}`,
  });

  const written: string[] = [];

  await withTools(directory, async () => {
    await copyToClipboard('hi', {
      environment: { DISPLAY: ':0' },
      runCommand: run,
      writeTerminal: (bytes) => written.push(bytes),
    });

    const pid = Number(await Bun.file(join(directory, 'xclip.pid')).text());
    const copied = await Bun.file(join(directory, 'xsel.out')).text();

    expect(copied).toBe('hi');
    expect(written).toEqual([]);
    expect(await Bun.file(join(directory, 'xclip.pid')).exists()).toBe(true);
    await expectDead(pid);
  });
});

it('writes OSC 52 when every tool hangs', async () => {
  const directory = await toolDirectory({ xclip: 'exec sleep 30', xsel: 'exec sleep 30' });

  const run = createCommandRunner({
    wlCopyStartupMs: 50,
    toolTimeoutMs: 50,
    searchPath: `${directory}:${process.env.PATH ?? ''}`,
  });

  const written: string[] = [];

  await withTools(directory, () =>
    copyToClipboard('hi', {
      environment: { DISPLAY: ':0' },
      runCommand: run,
      writeTerminal: (bytes) => written.push(bytes),
    }),
  );

  expect(written).toEqual([osc52Hi]);
});

it('counts a wl-copy that keeps running as a successful copy', async () => {
  const directory = await toolDirectory({
    'wl-copy': 'echo $$ > "$0.pid"\ncat > /dev/null\nexec sleep 30',
    xclip: 'echo fell > "$0.out"',
  });

  const run = createCommandRunner({
    wlCopyStartupMs: 100,
    toolTimeoutMs: 100,
    searchPath: `${directory}:${process.env.PATH ?? ''}`,
  });

  const written: string[] = [];

  await withTools(directory, async () => {
    await copyToClipboard('hi', {
      environment: { WAYLAND_DISPLAY: 'w', DISPLAY: ':0' },
      runCommand: run,
      writeTerminal: (bytes) => written.push(bytes),
    });

    expect(written).toEqual([]);
    expect(await Bun.file(join(directory, 'xclip.out')).exists()).toBe(false);

    const pid = Number(await Bun.file(join(directory, 'wl-copy.pid')).text());

    expect(processAlive(pid)).toBe(true);
    process.kill(pid, 'SIGKILL');
  });
});

it('uses the status of a wl-copy that exits within the startup wait', async () => {
  const directory = await toolDirectory({ 'wl-copy': 'cat > /dev/null\nexit 1' });

  const run = createCommandRunner({
    wlCopyStartupMs: 2000,
    toolTimeoutMs: 2000,
    searchPath: `${directory}:${process.env.PATH ?? ''}`,
  });

  const written: string[] = [];

  await withTools(directory, () =>
    copyToClipboard('hi', {
      environment: { WAYLAND_DISPLAY: 'w' },
      runCommand: run,
      writeTerminal: (bytes) => written.push(bytes),
    }),
  );

  expect(written).toEqual([osc52Hi]);
});

it('leaves the newer text last when an older copy finishes late', async () => {
  const finished: string[] = [];
  const releaseOlder = Promise.withResolvers<undefined>();
  const started: string[] = [];

  const queue = createClipboardQueue(async (text) => {
    started.push(text);

    if (text === 'older') {
      await releaseOlder.promise;
    }

    finished.push(text);
  });

  queue.copy('older');
  queue.copy('newer');
  await Promise.resolve();
  expect(started).toEqual(['older']);

  releaseOlder.resolve(undefined);
  await queue.idle();

  expect(finished).toEqual(['older', 'newer']);
});

it('aborts the running copy and skips queued copies when closed', async () => {
  const started: string[] = [];
  const aborted = Promise.withResolvers<undefined>();

  const queue = createClipboardQueue(async (text, signal) => {
    started.push(text);

    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        aborted.resolve(undefined);
        resolve();
      });
    });
  });

  queue.copy('running');
  queue.copy('waiting');
  await Promise.resolve();
  queue.close();
  await aborted.promise;
  await queue.idle();

  expect(started).toEqual(['running']);
});
