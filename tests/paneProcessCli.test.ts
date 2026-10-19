import { expect, it } from 'bun:test';

import { z } from 'zod';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { pollUntil, setup } from './paneHarness.ts';

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

it(
  'lists the folder of the shell and of the foreground command',
  async () => {
    const { koja, list, first } = await setup();

    expect((await koja('pane', 'send', 'cd /tmp\n')).exitCode).toBe(0);

    const moved = await pollUntil(list, (panes) => panes[0]?.cwd === '/tmp');

    expect(moved.find((pane) => pane.id === first)?.cwd).toBe('/tmp');

    expect((await koja('pane', 'send', '(cd /var && sleep 60)\n')).exitCode).toBe(0);

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
    const { koja, first } = await setup();

    expect((await koja('pane', 'send', 'sleep 60 | cat\n')).exitCode).toBe(0);

    const read = async () => {
      const result = await koja('pane', 'process-info', first);

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
    const { koja } = await setup();
    const failed = await koja('pane', 'process-info', 'pane-99');

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('There is no pane pane-99.');
  },
  cliTestTimeoutMs,
);
