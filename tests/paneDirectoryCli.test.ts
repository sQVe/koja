import { expect, it } from 'bun:test';
import { chmod, mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import type { z } from 'zod';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { pollUntil, setup } from './paneHarness.ts';
import type { paneListSchema } from './paneHarness.ts';

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
