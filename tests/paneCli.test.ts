import { describe, expect, it, onTestFinished } from 'bun:test';
import { chmod, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import packageJson from '../package.json' with { type: 'json' };
import { paneId } from '../src/ids.ts';
import { createFrameDecoder, encodeFrame, FrameKind } from '../src/protocol/frames.ts';
import { encodeControl } from '../src/protocol/messages.ts';
import { decodeRowUpdate, rowWords } from '../src/rows/rows.ts';
import { ghosttyCommit } from '../src/vt/vt.ts';
import { cliTestTimeoutMs, environmentFor, runCli, temporaryDirectory } from './cliHarness.ts';

const paneListSchema = z.array(
  z.object({
    id: z.string(),
    workspace: z.string(),
    tab: z.string(),
    lifecycle: z.string(),
    focused: z.boolean(),
    zoomed: z.boolean(),
    columns: z.number(),
    rows: z.number(),
    cwd: z.string().nullable(),
    foreground_cwd: z.string().nullable(),
  }),
);

const paneDoneSchema = z.object({ pane: z.string() });

const paneReadSchema = z.object({
  pane: z.string(),
  source: z.string(),
  epoch: z.number(),
  oldest: z.number(),
  from: z.number().nullable(),
  to: z.number().nullable(),
  lines: z.array(z.string()),
});

const workspaceDoneSchema = z.object({ workspace: z.string() });

// A shell that runs the body, then stays alive so the pane keeps its output.
const scriptedShell = async (directory: string, body: string): Promise<string> => {
  const path = join(directory, 'scripted-shell.sh');

  await writeFile(path, `#!/bin/sh\n${body}\nexec sleep 3600\n`);
  await chmod(path, 0o755);

  return path;
};

const setup = async (shellBody?: string) => {
  const directory = await temporaryDirectory();
  const socketPath = join(directory, 'run', 'phi.sock');
  const shell = shellBody === undefined ? '/bin/sh' : await scriptedShell(directory, shellBody);
  const environment = { ...environmentFor(directory), SHELL: shell, PS1: '' };

  const phi = (...commandArguments: string[]) =>
    runCli([...commandArguments, '--socket', socketPath], directory, environment);

  const started = await phi('server', 'start');

  expect(started.exitCode).toBe(0);

  const workspaceRoot = join(directory, 'work');

  await mkdir(workspaceRoot);

  const created = await phi('workspace', 'create', workspaceRoot, '--json');

  expect(created.exitCode).toBe(0);
  workspaceDoneSchema.parse(JSON.parse(created.stdout));

  const list = async () => {
    const listed = await phi('pane', 'list', '--json');

    expect(listed.exitCode).toBe(0);

    return paneListSchema.parse(JSON.parse(listed.stdout));
  };

  const act = async (...commandArguments: string[]): Promise<string> => {
    const result = await phi('pane', ...commandArguments, '--json');

    expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });

    return paneDoneSchema.parse(JSON.parse(result.stdout)).pane;
  };

  const [first] = await list();

  return { directory, phi, list, act, first: first?.id ?? '' };
};

const waitForFile = async (path: string): Promise<string> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const text = await readFile(path, 'utf8').catch(() => '');

    if (text.endsWith('\n')) {
      return text.trim();
    }

    await Bun.sleep(100);
  }

  return '';
};

const isRunning = (processId: number): boolean => {
  try {
    process.kill(processId, 0);

    return true;
  } catch {
    return false;
  }
};

it(
  'splits a pane below and to the right, and lists both with their sizes',
  async () => {
    const { list, act, first } = await setup();
    const [whole] = await list();

    const below = await act('split', first, '--direction', 'below');

    const afterBelow = await list();

    expect(afterBelow.map((pane) => pane.id)).toEqual([first, below]);
    expect(afterBelow.map((pane) => pane.focused)).toEqual([false, true]);
    expect(afterBelow[0]?.tab).toBe(afterBelow[1]?.tab);
    expect(afterBelow.every((pane) => pane.lifecycle === 'running')).toBe(true);
    expect(afterBelow.every((pane) => pane.columns === (whole?.columns ?? 0) - 2)).toBe(true);
    expect(afterBelow.reduce((sum, pane) => sum + pane.rows, 0)).toBeLessThan(whole?.rows ?? 0);

    const right = await act('split', below, '--direction', 'right');

    const afterRight = await list();
    const lower = afterRight.filter((pane) => pane.id === below || pane.id === right);

    expect(afterRight).toHaveLength(3);
    expect(afterRight.find((pane) => pane.id === right)?.focused).toBe(true);
    expect(lower[0]?.rows).toBe(lower[1]?.rows);

    expect((lower[0]?.columns ?? 0) + (lower[1]?.columns ?? 0)).toBeLessThan(
      afterBelow[1]?.columns ?? 0,
    );
  },
  cliTestTimeoutMs,
);

it(
  'zooms a pane over the whole tab and restores the split on a second zoom',
  async () => {
    const { list, act, first } = await setup();
    const [whole] = await list();
    const second = await act('split', first, '--direction', 'right');
    const split = await list();

    expect(split.map((pane) => pane.zoomed)).toEqual([false, false]);
    expect(await act('zoom', first)).toBe(first);

    const zoomed = await list();

    expect(zoomed.find((pane) => pane.id === first)).toMatchObject({
      zoomed: true,
      focused: true,
      columns: whole?.columns,
      rows: whole?.rows,
    });

    expect(zoomed.find((pane) => pane.id === second)?.zoomed).toBe(false);
    expect(await act('zoom', first)).toBe(first);

    const restored = await list();

    expect(restored.map((pane) => pane.zoomed)).toEqual([false, false]);

    expect(restored.map((pane) => [pane.columns, pane.rows])).toEqual(
      split.map((pane) => [pane.columns, pane.rows]),
    );
  },
  cliTestTimeoutMs,
);

const columnsOf = (panes: z.infer<typeof paneListSchema>, id: string) =>
  panes.find((pane) => pane.id === id)?.columns ?? 0;

it(
  'resizes a split by cells, and keeps the other pane at one cell past the minimum',
  async () => {
    const { phi, list, act, first } = await setup();
    const second = await act('split', first, '--direction', 'right');
    const before = await list();

    expect(await act('resize', first, '--direction', 'right', '--cells', '5')).toBe(first);

    const grown = await list();

    expect(columnsOf(grown, first)).toBe(columnsOf(before, first) + 5);
    expect(columnsOf(grown, second)).toBe(columnsOf(before, second) - 5);

    await act('resize', first, '--direction', 'left', '--cells', '2');

    const shrunk = await list();

    expect(columnsOf(shrunk, first)).toBe(columnsOf(grown, first) - 2);
    expect(columnsOf(shrunk, second)).toBe(columnsOf(grown, second) + 2);

    await act('resize', first, '--direction', 'right', '--cells', '100000');

    const squeezed = await list();

    expect(columnsOf(squeezed, second)).toBe(1);
    expect(columnsOf(squeezed, first)).toBeGreaterThan(columnsOf(before, first));

    const vertical = await phi('pane', 'resize', first, '--direction', 'down', '--cells', '1');

    expect(vertical.exitCode).toBe(1);
    expect(vertical.stderr).toContain(first);
    expect(await list()).toEqual(squeezed);
  },
  cliTestTimeoutMs,
);

it(
  'moves focus with pane focus, and pane send reaches only the focused pane',
  async () => {
    const { directory, phi, list, act, first } = await setup();
    const second = await act('split', first, '--direction', 'right');

    expect((await list()).find((pane) => pane.focused)?.id).toBe(second);

    expect(await act('focus', first)).toBe(first);
    expect((await list()).find((pane) => pane.focused)?.id).toBe(first);

    const marker = join(directory, 'marker');
    const sent = await phi('pane', 'send', `echo reached > ${marker}\n`);

    expect(sent.exitCode).toBe(0);
    expect(await waitForFile(marker)).toBe('reached');

    const read = async (id: string): Promise<string> => {
      const result = await phi('pane', 'read', '--pane', id, '--json');

      return paneReadSchema.parse(JSON.parse(result.stdout)).lines.join('\n');
    };

    let firstOutput = '';

    for (let attempt = 0; attempt < 50 && !firstOutput.includes('reached'); attempt += 1) {
      firstOutput = await read(first);
    }

    expect(firstOutput).toContain('echo reached');
    expect(await read(second)).not.toContain('echo reached');
  },
  cliTestTimeoutMs,
);

it(
  'closes a pane, ends its process, and gives its area to the sibling',
  async () => {
    const { directory, phi, list, act, first } = await setup();
    const [whole] = await list();
    const second = await act('split', first, '--direction', 'below');
    const pidFile = join(directory, 'pid');
    const sent = await phi('pane', 'send', `echo $$ > ${pidFile}\n`);

    expect(sent.exitCode).toBe(0);

    const processId = Number(await waitForFile(pidFile));

    expect(isRunning(processId)).toBe(true);
    expect(await act('close', second)).toBe(second);

    const remaining = await list();

    expect(remaining.map((pane) => pane.id)).toEqual([first]);

    expect(remaining[0]).toMatchObject({
      focused: true,
      columns: whole?.columns,
      rows: whole?.rows,
    });

    for (let attempt = 0; attempt < 100 && isRunning(processId); attempt += 1) {
      await Bun.sleep(100);
    }

    expect(isRunning(processId)).toBe(false);
  },
  cliTestTimeoutMs,
);

it.each([
  ['split', ['--direction', 'right']],
  ['focus', []],
  ['close', []],
  ['zoom', []],
  ['resize', ['--direction', 'left', '--cells', '2']],
])(
  'pane %s exits 1 for an unknown pane and changes nothing',
  async (action, extra) => {
    const { phi, list } = await setup();
    const before = await list();
    const failed = await phi('pane', action, 'pane-99', ...extra);

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('pane-99');
    expect(await list()).toEqual(before);
  },
  cliTestTimeoutMs,
);

const withoutFolders = (panes: z.infer<typeof paneListSchema>) =>
  panes.map(({ cwd: _cwd, foreground_cwd: _foregroundCwd, ...rest }) => rest);

it(
  'leaves the focus where it was when a split pane fails to start',
  async () => {
    const { directory, phi, list, act, first } = await setup();

    await act('split', first, '--direction', 'right');

    const before = await list();

    await rm(join(directory, 'work'), { recursive: true });

    const failure = await phi('pane', 'split', first, '--direction', 'below');

    expect(failure.exitCode).toBe(1);

    expect(withoutFolders(await list())).toEqual(withoutFolders(before));
  },
  cliTestTimeoutMs,
);

const processInfoSchema = z.object({
  pane: z.string(),
  shell_pid: z.number(),
  foreground_process_group_id: z.number().nullable(),
  foreground_processes: z.array(
    z.object({
      pid: z.number(),
      name: z.string(),
      argv: z.array(z.string()),
      cmdline: z.string(),
      cwd: z.string().nullable(),
    }),
  ),
});

const sortedCommands = (info: z.infer<typeof processInfoSchema>): string =>
  info.foreground_processes
    .map((process) => process.cmdline)
    .toSorted()
    .join('\n');

const pollUntil = async <Value>(
  read: () => Promise<Value>,
  done: (value: Value) => boolean,
): Promise<Value> => {
  let value = await read();

  for (let attempt = 0; attempt < 100 && !done(value); attempt += 1) {
    await Bun.sleep(100);
    value = await read();
  }

  return value;
};

it(
  'lists the folder of the shell and of the foreground command',
  async () => {
    const { phi, list, first } = await setup();

    expect((await phi('pane', 'send', 'cd /tmp\n')).exitCode).toBe(0);

    const moved = await pollUntil(list, (panes) => panes[0]?.cwd === '/tmp');

    expect(moved.find((pane) => pane.id === first)?.cwd).toBe('/tmp');

    expect((await phi('pane', 'send', '(cd /var && sleep 60)\n')).exitCode).toBe(0);

    const running = await pollUntil(list, (panes) => panes[0]?.foreground_cwd === '/var');
    const pane = running.find((known) => known.id === first);

    expect(pane?.foreground_cwd).toBe('/var');
    expect(pane?.cwd).toBe('/tmp');
  },
  cliTestTimeoutMs,
);

it(
  'shows the shell and each foreground process of a pane',
  async () => {
    const { phi, first } = await setup();

    expect((await phi('pane', 'send', 'sleep 60 | cat\n')).exitCode).toBe(0);

    const read = async () => {
      const result = await phi('pane', 'process-info', first, '--json');

      expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
        exitCode: 0,
        stderr: '',
      });

      return processInfoSchema.parse(JSON.parse(result.stdout));
    };

    const info = await pollUntil(read, (value) => sortedCommands(value) === 'cat\nsleep 60');

    expect(info.pane).toBe(first);
    const argvs = info.foreground_processes.map((process) => process.argv);

    expect(argvs).toContainEqual(['sleep', '60']);
    expect(argvs).toContainEqual(['cat']);
    expect(argvs).toHaveLength(2);
    expect(info.shell_pid).toBeGreaterThan(0);
    expect(info.foreground_process_group_id).toBeGreaterThan(0);
  },
  cliTestTimeoutMs,
);

it(
  'pane process-info exits 1 for an unknown pane and prints nothing on stdout',
  async () => {
    const { phi } = await setup();
    const failed = await phi('pane', 'process-info', 'pane-99');

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('There is no pane pane-99.');
  },
  cliTestTimeoutMs,
);

const folderOf = (panes: z.infer<typeof paneListSchema>, id: string) =>
  panes.find((pane) => pane.id === id)?.cwd;

const makeFolder = async (parent: string, name: string): Promise<string> => {
  const path = join(parent, name);

  await mkdir(path);

  return realpath(path);
};

it(
  'starts a split pane in the folder its source pane moved to',
  async () => {
    const { directory, phi, list, act, first } = await setup();
    const target = await makeFolder(directory, 'elsewhere');

    expect((await phi('pane', 'send', `cd ${target}\n`)).exitCode).toBe(0);
    await pollUntil(list, (panes) => folderOf(panes, first) === target);

    const added = await act('split', first, '--direction', 'right');
    const panes = await pollUntil(list, (known) => folderOf(known, added) !== undefined);

    expect(folderOf(panes, added)).toBe(target);
  },
  cliTestTimeoutMs,
);

it(
  'starts a split pane in the folder of the foreground command',
  async () => {
    const { directory, phi, list, act, first } = await setup();
    const shellFolder = await makeFolder(directory, 'shell');
    const commandFolder = await makeFolder(directory, 'command');

    expect((await phi('pane', 'send', `cd ${shellFolder}\n`)).exitCode).toBe(0);
    await pollUntil(list, (panes) => folderOf(panes, first) === shellFolder);

    const command = `sh -c 'cd ${commandFolder}; sleep 600'\n`;

    expect((await phi('pane', 'send', command)).exitCode).toBe(0);

    await pollUntil(
      list,
      (panes) => panes.find((pane) => pane.id === first)?.foreground_cwd === commandFolder,
    );

    const added = await act('split', first, '--direction', 'right');
    const panes = await pollUntil(list, (known) => folderOf(known, added) !== undefined);

    expect(folderOf(panes, added)).toBe(commandFolder);
  },
  cliTestTimeoutMs,
);

const restoreAccess = (path: string) => chmod(path, 0o755).catch(() => undefined);

const unusableSetups = [
  { name: 'deleted', prepare: 'rmdir ../command' },
  { name: 'not enterable', prepare: 'chmod 000 .' },
] as const;

for (const unusable of unusableSetups) {
  it(
    `falls back to the shell folder when the foreground folder is ${unusable.name}`,
    async () => {
      const { directory, phi, list, act, first } = await setup();
      const shellFolder = await makeFolder(directory, 'shell');
      const commandFolder = await makeFolder(directory, 'command');

      try {
        expect((await phi('pane', 'send', `cd ${shellFolder}\n`)).exitCode).toBe(0);
        await pollUntil(list, (panes) => folderOf(panes, first) === shellFolder);

        const command = `sh -c 'cd ${commandFolder}; ${unusable.prepare}; sleep 600'\n`;

        expect((await phi('pane', 'send', command)).exitCode).toBe(0);

        await pollUntil(list, (panes) => {
          const foreground = panes.find((pane) => pane.id === first)?.foreground_cwd;

          return foreground !== null && foreground !== undefined && foreground !== shellFolder;
        });

        const added = await act('split', first, '--direction', 'right');
        const panes = await pollUntil(list, (known) => folderOf(known, added) !== undefined);

        expect(folderOf(panes, added)).toBe(shellFolder);
      } finally {
        await restoreAccess(commandFolder);
      }
    },
    cliTestTimeoutMs,
  );

  it(
    `falls back to the workspace root when the shell folder is ${unusable.name}`,
    async () => {
      const { directory, phi, list, act, first } = await setup();
      const root = await realpath(join(directory, 'work'));
      const commandFolder = await makeFolder(directory, 'command');

      try {
        const command = `cd ${commandFolder} && ${unusable.prepare}\n`;

        expect((await phi('pane', 'send', command)).exitCode).toBe(0);

        await pollUntil(list, (panes) => {
          const cwd = folderOf(panes, first);

          return cwd !== null && cwd !== undefined && cwd !== root;
        });

        const added = await act('split', first, '--direction', 'right');
        const panes = await pollUntil(list, (known) => folderOf(known, added) !== undefined);

        expect(folderOf(panes, added)).toBe(root);
      } finally {
        await restoreAccess(commandFolder);
      }
    },
    cliTestTimeoutMs,
  );
}

it(
  'starts a split pane in --cwd even when the source pane is in another folder',
  async () => {
    const { directory, phi, list, act, first } = await setup();
    const moved = await makeFolder(directory, 'moved');
    const target = await makeFolder(directory, 'target');

    expect((await phi('pane', 'send', `cd ${moved}\n`)).exitCode).toBe(0);
    await pollUntil(list, (panes) => folderOf(panes, first) === moved);

    const added = await act('split', first, '--direction', 'right', '--cwd', target);
    const panes = await pollUntil(list, (known) => folderOf(known, added) !== undefined);

    expect(folderOf(panes, added)).toBe(target);
  },
  cliTestTimeoutMs,
);

it(
  'resolves a relative --cwd against the folder the CLI runs in',
  async () => {
    const { directory, list, act, first } = await setup();
    const target = await makeFolder(directory, 'relative');

    // The CLI runs in `directory`, so `relative` names `target`.
    const added = await act('split', first, '--direction', 'right', '--cwd', 'relative');
    const panes = await pollUntil(list, (known) => folderOf(known, added) !== undefined);

    expect(folderOf(panes, added)).toBe(target);
  },
  cliTestTimeoutMs,
);

it(
  'refuses a --cwd that is not a directory and splits nothing',
  async () => {
    const { directory, phi, list, first } = await setup();
    const missing = join(directory, 'missing');
    const before = await list();

    const failed = await phi('pane', 'split', first, '--direction', 'right', '--cwd', missing);

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain(`${missing} is not a directory.`);
    expect(await list()).toEqual(before);
  },
  cliTestTimeoutMs,
);

const readJson = async (phi: Awaited<ReturnType<typeof setup>>['phi'], ...flags: string[]) => {
  const result = await phi('pane', 'read', ...flags, '--json');

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  return paneReadSchema.parse(JSON.parse(result.stdout));
};

// The scripted shell ends its output with "done" and no newline, so the last row holds it.
const waitForDone = async (phi: Awaited<ReturnType<typeof setup>>['phi']): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const read = await readJson(phi, '--lines', '1');

    if (read.lines.at(-1) === 'done') {
      return;
    }

    await Bun.sleep(100);
  }

  throw new Error('The pane did not finish its output.');
};

const numbered = (prefix: string, first: number, last: number): string[] =>
  Array.from({ length: last - first + 1 }, (_, index) => `${prefix}${first + index}`);

it(
  'reads a row range and the last lines of a pane that printed 500 lines',
  async () => {
    const { phi } = await setup("seq 1 500 | sed 's/^/a/'\nprintf done");

    await waitForDone(phi);

    const range = await readJson(phi, '--from', '0', '--to', '9');

    expect(range).toMatchObject({ from: 0, to: 9, oldest: 0 });
    expect(range.lines).toEqual(numbered('a', 1, 10));

    const recent = await readJson(phi, '--source', 'recent', '--lines', '5');

    expect(recent.source).toBe('recent');
    expect(recent.lines).toEqual([...numbered('a', 497, 500), 'done']);
  },
  cliTestTimeoutMs,
);

it(
  'returns a line the terminal wrapped as one line when unwrapped and as rows otherwise',
  async () => {
    const wide = '0123456789'.repeat(10);
    const { phi, list } = await setup(`echo ${wide}\nprintf done`);

    await waitForDone(phi);

    const [pane] = await list();
    const columns = pane?.columns ?? 0;

    expect(columns).toBeLessThan(wide.length);

    const rows = await readJson(phi, '--source', 'recent', '--lines', '3');

    expect(rows.lines).toEqual([wide.slice(0, columns), wide.slice(columns), 'done']);

    const joined = await readJson(phi, '--source', 'recent-unwrapped', '--lines', '3');

    expect(joined.source).toBe('recent-unwrapped');
    expect(joined.lines).toEqual([wide, 'done']);
  },
  cliTestTimeoutMs,
);

it(
  'fails a range below the oldest kept row and names that row',
  async () => {
    const { phi } = await setup('seq 1 120000\nprintf done');

    await waitForDone(phi);

    const kept = await readJson(phi, '--lines', '1');

    expect(kept.oldest).toBeGreaterThan(0);

    const pruned = await phi('pane', 'read', '--from', '0', '--to', '9');

    expect(pruned.exitCode).not.toBe(0);
    expect(pruned.stdout).toBe('');
    expect(pruned.stderr).toContain(`oldest kept row is ${kept.oldest}`);

    const range = await readJson(phi, '--from', String(kept.oldest), '--to', String(kept.oldest));

    expect(range.lines).toHaveLength(1);
  },
  cliTestTimeoutMs,
);

describe('a pane with more output than one reply holds', () => {
  const output = "seq 1 1200 | sed 's/^/n/'\nprintf done";

  it(
    'returns a range larger than one reply in full',
    async () => {
      const { phi } = await setup(output);

      await waitForDone(phi);

      const range = await readJson(phi, '--from', '0', '--to', '899');

      expect(range).toMatchObject({ from: 0, to: 899 });
      expect(range.lines).toEqual(numbered('n', 1, 900));
    },
    cliTestTimeoutMs,
  );

  it(
    'returns the last 1000 rows of a recent read',
    async () => {
      const { phi } = await setup(output);

      await waitForDone(phi);

      const recent = await readJson(phi, '--source', 'recent', '--lines', '1000');

      expect(recent.lines).toEqual([...numbered('n', 202, 1200), 'done']);
      expect(recent.to).toBe(1200);
    },
    cliTestTimeoutMs,
  );
});

it(
  'prints text with a final line feed for recent and visible reads and none for recent-unwrapped',
  async () => {
    const { phi } = await setup('echo one\necho two\nprintf done');

    await waitForDone(phi);

    const text = async (source: string) =>
      (await phi('pane', 'read', '--source', source, '--lines', '3')).stdout;

    expect(await text('recent')).toBe('one\ntwo\ndone\n');
    expect(await text('visible')).toBe('one\ntwo\ndone\n');
    expect(await text('recent-unwrapped')).toBe('one\ntwo\ndone');
  },
  cliTestTimeoutMs,
);

it.each(['recent', 'visible'])(
  'reads no lines and null bounds with --lines 0 from the %s source',
  async (source) => {
    const { phi } = await setup('echo one\nprintf done');

    await waitForDone(phi);

    const read = await readJson(phi, '--source', source, '--lines', '0');

    expect(read).toMatchObject({ from: null, to: null, lines: [] });
  },
  cliTestTimeoutMs,
);

const waitForText = async (
  phi: Awaited<ReturnType<typeof setup>>['phi'],
  text: string,
  source = 'visible',
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const read = await readJson(phi, '--source', source, '--lines', '30');

    if (read.lines.includes(text)) {
      return;
    }

    await Bun.sleep(100);
  }

  throw new Error(`The pane never showed ${text}.`);
};

it(
  'drops the blank rows at the end of a recent read',
  async () => {
    const { phi } = await setup('echo one');

    await waitForText(phi, 'one');

    const recent = await phi('pane', 'read', '--source', 'recent');
    const unwrapped = await phi('pane', 'read', '--source', 'recent-unwrapped');
    const json = await readJson(phi, '--source', 'recent');

    expect(recent.stdout).toBe('one\n');
    expect(unwrapped.stdout).toBe('one');
    expect(json.lines).toEqual(['one']);
    expect(json.to).toBeGreaterThan(json.from ?? 0);
  },
  cliTestTimeoutMs,
);

it(
  'prints empty text for a recent read of blank rows on the alternate screen',
  async () => {
    const { phi } = await setup("printf '\\033[?1049h\\033[Hx'");

    await waitForText(phi, 'x');

    const recent = await phi('pane', 'read', '--source', 'recent', '--lines', '3');
    const json = await readJson(phi, '--source', 'recent', '--lines', '3');

    expect(recent.stdout).toBe('');
    expect(json.lines).toEqual([]);
  },
  cliTestTimeoutMs,
);

it(
  'keeps the blank rows of an explicit range, one line per row',
  async () => {
    const { phi } = await setup("printf 'a\\n\\nb\\n\\n'\nprintf done");

    await waitForDone(phi);

    const range = await readJson(phi, '--from', '0', '--to', '3');

    expect(range).toMatchObject({ from: 0, to: 3 });
    expect(range.lines).toEqual(['a', '', 'b', '']);
  },
  cliTestTimeoutMs,
);

const connectLargeTerminal = async (
  socketPath: string,
  size: { columns: number; rows: number },
) => {
  const decoder = createFrameDecoder();
  const commit = ghosttyCommit();

  if (!commit.ok) {
    throw new Error(commit.detail);
  }

  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data: (connection, bytes) => {
        const decoded = decoder.push(bytes);

        for (const frame of decoded.ok ? decoded.frames : []) {
          const update =
            frame.kind === FrameKind.rowUpdate ? decodeRowUpdate(frame.payload) : undefined;

          if (update?.ok === true) {
            const { pane, sequence } = update.update;
            const ack = encodeControl({ type: 'ack', paneId: paneId(pane), sequence });

            connection.write(encodeFrame(FrameKind.control, ack));
          }
        }
      },
    },
  });

  onTestFinished(() => {
    socket.end();
  });

  const version = { version: packageJson.version, ghostty: commit.commit };
  const hello = encodeControl({ type: 'hello', version, size });

  socket.write(encodeFrame(FrameKind.control, hello));
};

it(
  'reads the whole visible screen of a pane too large for one reply',
  async () => {
    const { directory, phi, list } = await setup();
    const socketPath = join(directory, 'run', 'phi.sock');

    await connectLargeTerminal(socketPath, { columns: 340, rows: 131 });

    let pane = (await list())[0];

    for (let attempt = 0; attempt < 100 && (pane?.columns ?? 0) < 300; attempt += 1) {
      await Bun.sleep(100);
      pane = (await list())[0];
    }

    const columns = pane?.columns ?? 0;
    const rows = pane?.rows ?? 0;

    expect(columns).toBeGreaterThanOrEqual(300);
    expect(rowWords(columns) * 4 * rows).toBeGreaterThan(512 * 1024);

    const sent = await phi('pane', 'send', "seq 1 400 | sed 's/^/v/'; printf done\n");

    expect(sent.exitCode).toBe(0);
    await waitForText(phi, 'done');

    const full = await readJson(phi, '--source', 'visible');

    expect(full.lines).toHaveLength(rows);
    expect(full.lines.at(-1)).toBe('done');
    expect(full.lines.at(-2)).toBe('v400');
    expect(full.to).toBe((full.from ?? 0) + rows - 1);

    const counted = await readJson(phi, '--source', 'visible', '--lines', '120');

    expect(counted.lines).toEqual(full.lines.slice(-120));
  },
  cliTestTimeoutMs,
);

it(
  'prints one blank row of an explicit range as an empty line',
  async () => {
    const { phi } = await setup("printf 'a\\n\\nb\\n'\nprintf done");

    await waitForDone(phi);

    const text = await phi('pane', 'read', '--from', '1', '--to', '1');
    const json = await readJson(phi, '--from', '1', '--to', '1');

    expect(text.stdout).toBe('\n');
    expect(json.lines).toEqual(['']);
  },
  cliTestTimeoutMs,
);

it(
  'trims Unicode whitespace from recent rows and only spaces from recent-unwrapped lines',
  async () => {
    const { phi } = await setup("printf 'hello\\302\\240\\n'\nprintf done");

    await waitForDone(phi);

    const recent = await phi('pane', 'read', '--source', 'recent', '--lines', '2');
    const json = await readJson(phi, '--source', 'recent', '--lines', '2');
    const unwrapped = await phi('pane', 'read', '--source', 'recent-unwrapped', '--lines', '2');

    expect(recent.stdout).toBe('hello\ndone\n');
    expect(json.lines).toEqual(['hello', 'done']);
    expect(unwrapped.stdout).toBe('hello\u00a0\ndone');
  },
  cliTestTimeoutMs,
);

it(
  'reads every row of a visible screen taller than one reply, and clamps a count to 1000',
  async () => {
    const { directory, phi, list } = await setup();

    await connectLargeTerminal(join(directory, 'run', 'phi.sock'), { columns: 100, rows: 1006 });

    let pane = (await list())[0];

    for (let attempt = 0; attempt < 100 && (pane?.rows ?? 0) < 1005; attempt += 1) {
      await Bun.sleep(100);
      pane = (await list())[0];
    }

    expect(pane?.rows).toBe(1005);

    const sent = await phi('pane', 'send', "printf '\\033[2J\\033[H'; seq 1 1004; printf done\n");

    expect(sent.exitCode).toBe(0);
    await waitForText(phi, 'done');

    const full = await readJson(phi, '--source', 'visible');

    expect(full.lines.slice(0, 3)).toEqual(['1', '2', '3']);
    expect(full.lines.at(-1)).toBe('done');
    expect(full.to).toBe((full.from ?? 0) + 1004);

    const counted = await readJson(phi, '--source', 'visible', '--lines', '2000');

    expect(counted.lines).toHaveLength(1000);
    expect(counted.lines.at(-1)).toBe('done');
  },
  cliTestTimeoutMs,
);

// Forwards a CLI connection to the server and holds the first rows reply until released, so the
// test can change the pane between the first page and the next request.
// A socket write can take fewer bytes than given. The rest waits for the drain.
const pendingWrites = new WeakMap<object, Uint8Array>();

const send = (socket: { write: (bytes: Uint8Array) => number }, bytes: Uint8Array): void => {
  const queued = pendingWrites.get(socket);

  if (queued !== undefined) {
    pendingWrites.set(socket, Uint8Array.from([...queued, ...bytes]));

    return;
  }

  const written = socket.write(bytes);

  if (written < bytes.length) {
    pendingWrites.set(socket, bytes.subarray(written));
  }
};

const wait = (file: string) => `while [ ! -f ${file} ]; do sleep 0.05; done`;

const holdFirstPage = async (upstreamPath: string, proxyPath: string) => {
  const held = Promise.withResolvers<undefined>();
  const gate = Promise.withResolvers<undefined>();
  let seen = false;

  const listener = Bun.listen<{
    upstream: Promise<Awaited<ReturnType<typeof Bun.connect>>>;
  }>({
    unix: proxyPath,
    socket: {
      open: (client) => {
        const decoder = createFrameDecoder();

        client.data = {
          upstream: Bun.connect({
            unix: upstreamPath,
            socket: {
              data: async (_upstream, bytes) => {
                const decoded = decoder.push(bytes);

                for (const frame of decoded.ok ? decoded.frames : []) {
                  if (frame.kind === FrameKind.paneRows && !seen) {
                    seen = true;
                    held.resolve(undefined);
                    await gate.promise;
                  }

                  send(client, encodeFrame(frame.kind, frame.payload));
                }
              },
              close: () => {
                client.end();
              },
            },
          }),
        };
      },
      drain: (client) => {
        const queued = pendingWrites.get(client);

        if (queued === undefined) {
          return;
        }

        pendingWrites.delete(client);
        send(client, queued);
      },
      data: async (client, bytes) => {
        (await client.data.upstream).write(bytes);
      },
      close: async (client) => {
        (await client.data.upstream).end();
      },
    },
  });

  onTestFinished(() => {
    listener.stop(true);
  });

  return {
    held: held.promise,
    release: () => {
      gate.resolve(undefined);
    },
  };
};

// Starts a visible read of a pane too large for one reply through a proxy that holds its first
// part, runs the pane's switching steps, and returns the finished read.
const readAcrossSwitch = async (switchSteps: string[], waitFor: string) => {
  const { directory, phi, list } = await setup();
  const socketPath = join(directory, 'run', 'phi.sock');

  await connectLargeTerminal(socketPath, { columns: 340, rows: 131 });

  let pane = (await list())[0];

  for (let attempt = 0; attempt < 100 && (pane?.columns ?? 0) < 300; attempt += 1) {
    await Bun.sleep(100);
    pane = (await list())[0];
  }

  const script = [
    "printf '\\033[?1049h\\033[H'",
    'seq 1 300',
    "printf 'ready\\n'",
    wait('switch'),
    ...switchSteps,
  ].join('; ');

  expect((await phi('pane', 'send', `${script}\n`)).exitCode).toBe(0);
  await waitForText(phi, 'ready');

  const proxyPath = join(directory, 'proxy.sock');
  const proxy = await holdFirstPage(socketPath, proxyPath);

  const read = runCli(
    ['pane', 'read', '--source', 'visible', '--json', '--socket', proxyPath],
    directory,
    environmentFor(directory),
  );

  await proxy.held;
  await writeFile(join(directory, 'work', 'switch'), '');
  await waitForText(phi, waitFor);
  proxy.release();

  return read;
};

it(
  'returns the snapshot of a multi-part read when the pane leaves and enters the alternate screen between parts',
  async () => {
    const result = await readAcrossSwitch(
      ["printf '\\033[?1049l'", "printf '\\033[?1049h\\033[HAGAIN'"],
      'AGAIN',
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const lines = paneReadSchema.parse(JSON.parse(result.stdout)).lines;

    expect(lines).toContain('ready');
    expect(lines).not.toContain('AGAIN');
    expect(lines).toContain('300');
  },
  cliTestTimeoutMs,
);

it(
  'returns the snapshot of a multi-part read when both screen switches happen inside one write',
  async () => {
    const result = await readAcrossSwitch(
      ["printf '\\033[?1049l\\033[?1049h\\033[HAGAIN'"],
      'AGAIN',
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');

    const lines = paneReadSchema.parse(JSON.parse(result.stdout)).lines;

    expect(lines).toContain('ready');
    expect(lines).not.toContain('AGAIN');
    expect(lines).toContain('300');
  },
  cliTestTimeoutMs,
);

const largePane = async (columns: number, rows: number) => {
  const harness = await setup();

  await connectLargeTerminal(join(harness.directory, 'run', 'phi.sock'), { columns, rows });

  let pane = (await harness.list())[0];

  for (let attempt = 0; attempt < 100 && (pane?.columns ?? 0) < columns - 40; attempt += 1) {
    await Bun.sleep(100);
    pane = (await harness.list())[0];
  }

  return harness;
};

it(
  'returns every row of a read that needs several parts once, joining a wrapped line across the part edges',
  async () => {
    const { phi } = await largePane(340, 131);

    const sent = await phi(
      'pane',
      'send',
      "printf '\\033[2J\\033[H'; head -c 51000 /dev/zero | tr '\\0' x; printf '\\nsecond\\n'; printf done\n",
    );

    expect(sent.exitCode).toBe(0);
    await waitForText(phi, 'done');

    const unwrapped = await readJson(phi, '--source', 'recent-unwrapped', '--lines', '200');

    expect(unwrapped.lines).toHaveLength(3);
    expect(unwrapped.lines[0]).toBe('x'.repeat(51_000));
    expect(unwrapped.lines.slice(1)).toEqual(['second', 'done']);

    const rows = await readJson(phi, '--source', 'recent', '--lines', '200');

    expect(rows.lines.length).toBeGreaterThan(150);
    expect(rows.lines.join('')).toBe(`${'x'.repeat(51_000)}seconddone`);
    expect((rows.to ?? 0) - (rows.from ?? 0) + 1).toBe(rows.lines.length);
  },
  cliTestTimeoutMs,
);

it(
  'pages a read larger than one snapshot by range and fails without output when the screen changes',
  async () => {
    const { directory, phi } = await largePane(1100, 40);

    const script = [
      "printf '\\033[2J\\033[H'",
      'seq 1 1500',
      "printf 'ready\\n'",
      wait('switch'),
      "printf '\\033[?1049h\\033[HAGAIN'",
    ].join('; ');

    expect((await phi('pane', 'send', `${script}\n`)).exitCode).toBe(0);
    await waitForText(phi, 'ready');

    const kept = await readJson(phi, '--lines', '1');
    const last = kept.to ?? 0;
    const proxyPath = join(directory, 'proxy.sock');
    const proxy = await holdFirstPage(join(directory, 'run', 'phi.sock'), proxyPath);

    const read = runCli(
      ['pane', 'read', '--from', String(kept.oldest), '--to', String(last), '--socket', proxyPath],
      directory,
      environmentFor(directory),
    );

    await proxy.held;
    await writeFile(join(directory, 'work', 'switch'), '');
    await waitForText(phi, 'AGAIN');
    proxy.release();

    const result = await read;

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('switched between its primary and alternate screens');
  },
  cliTestTimeoutMs,
);
