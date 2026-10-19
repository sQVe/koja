import { afterEach, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sessionGroups } from '../src/server/processGroups.ts';
import { readFollowFolder, readPaneFolders, readPaneProcesses } from '../src/server/processInfo.ts';
import type { PaneProcesses } from '../src/server/processInfo.ts';

const pollDeadlineMs = 5000;

const directories: string[] = [];
const shells: Bun.Subprocess[] = [];

const startShell = (): Bun.Subprocess => {
  const directory = mkdtempSync(join(tmpdir(), 'koja-pane-processes-'));
  directories.push(directory);

  const shell = Bun.spawn(['/bin/sh', '-i'], {
    cwd: directory,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', TERM: 'xterm-256color', PS1: '$ ' },
    terminal: { cols: 80, rows: 24, name: 'xterm-256color', data: () => {} },
  });

  shells.push(shell);

  return shell;
};

const waitFor = async (
  shell: Bun.Subprocess,
  accept: (processes: PaneProcesses) => boolean,
): Promise<PaneProcesses> => {
  const deadline = Date.now() + pollDeadlineMs;
  let latest = readPaneProcesses(shell.pid);

  while (!accept(latest) && Date.now() < deadline) {
    await Bun.sleep(20);
    latest = readPaneProcesses(shell.pid);
  }

  return latest;
};

afterEach(() => {
  for (const shell of shells.splice(0)) {
    for (const group of sessionGroups(shell.pid)) {
      try {
        process.kill(-group, 'SIGKILL');
      } catch {
        // The group already ended.
      }
    }

    shell.kill('SIGKILL');
    shell.terminal?.close();
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('reads the shell folder as its own and the foreground folder when the shell is idle', async () => {
  const shell = startShell();
  shell.terminal?.write('cd /tmp\n');

  const processes = await waitFor(shell, (read) => read.cwd === '/tmp');

  expect(processes.cwd).toBe('/tmp');
  expect(processes.foregroundCwd).toBe('/tmp');
  expect(processes.foregroundGroup).toBe(shell.pid);
});

it('reads the folder of a foreground command that left the shell folder', async () => {
  const shell = startShell();
  shell.terminal?.write('cd /tmp\n(cd /var && sleep 60)\n');

  const processes = await waitFor(shell, (read) => read.foregroundCwd === '/var');

  expect(processes.cwd).toBe('/tmp');
  expect(processes.foregroundCwd).toBe('/var');
});

const pipelineCommands = ['cat', 'sleep 60'];

const sortedCommands = (processes: PaneProcesses): string[] =>
  processes.foregroundProcesses.map((entry) => entry.cmdline).toSorted();

it('lists every process of a foreground pipeline', async () => {
  const shell = startShell();
  shell.terminal?.write('sleep 60 | cat\n');

  const processes = await waitFor(
    shell,
    (read) => sortedCommands(read).join('\n') === pipelineCommands.join('\n'),
  );

  expect(sortedCommands(processes)).toEqual(pipelineCommands);

  expect(
    processes.foregroundProcesses
      .map((entry) => entry.argv)
      .toSorted((left, right) => left.length - right.length),
  ).toEqual([['cat'], ['sleep', '60']]);

  expect(processes.foregroundGroup).not.toBe(shell.pid);
  const groups = new Set(processes.foregroundProcesses.map((entry) => entry.group));

  expect([...groups]).toEqual([processes.foregroundGroup as number]);
});

it('reads the same folders with the folder-only reader as with the process reader', async () => {
  const shell = startShell();
  shell.terminal?.write('cd /tmp\n(cd /var && sleep 60)\n');

  await waitFor(shell, (read) => read.foregroundCwd === '/var');

  const folders = readPaneFolders(shell.pid);
  const processes = readPaneProcesses(shell.pid);

  expect(folders.cwd).toBe('/tmp');
  expect(folders.foregroundCwd).toBe('/var');
  expect(folders.cwd).toBe(processes.cwd);
  expect(folders.foregroundCwd).toBe(processes.foregroundCwd);
  expect(folders.foregroundGroup).toBe(processes.foregroundGroup);
});

it('reads the folder of a foreground process when the group leader has exited', async () => {
  const shell = startShell();
  shell.terminal?.write('cd /tmp\ntrue | (cd /var && sleep 60)\n');

  const processes = await waitFor(shell, (read) =>
    read.foregroundProcesses.some((entry) => entry.cmdline === 'sleep 60'),
  );

  const folders = await waitFor(shell, (read) => read.foregroundCwd === '/var');

  expect(processes.cwd).toBe('/tmp');
  expect(folders.foregroundCwd).toBe('/var');
  expect(readPaneFolders(shell.pid).foregroundCwd).toBe('/var');
  expect(readPaneFolders(shell.pid).cwd).toBe('/tmp');
});

it('does not follow a real folder named like the deleted folder of the pane', async () => {
  const shell = startShell();
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'koja-deleted-')));
  directories.push(parent);

  const gone = join(parent, 'A');
  const lookalike = `${gone} (deleted)`;
  const shellFolder = realpathSync(directories[0] ?? '');

  mkdirSync(gone);
  shell.terminal?.write(`(cd ${gone} && sleep 60)\n`);
  await waitFor(shell, (read) => read.foregroundCwd === gone);

  rmSync(gone, { recursive: true });
  mkdirSync(lookalike);

  expect(readFollowFolder(shell.pid)).toBe(shellFolder);
});

it('follows a real folder whose name ends in (deleted)', async () => {
  const shell = startShell();
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'koja-named-')));
  directories.push(parent);

  const folder = join(parent, 'A (deleted)');

  mkdirSync(folder);
  shell.terminal?.write(`cd '${folder}'\n`);
  await waitFor(shell, (read) => read.cwd === folder);

  expect(readFollowFolder(shell.pid)).toBe(folder);
});
