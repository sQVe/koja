import { afterAll, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Placement } from '../scripts/benchmarkMachine.ts';
import { createCliRunner, createKojaRunner, repositoryRoot } from '../scripts/benchmarkServer.ts';

const folder = mkdtempSync(join(tmpdir(), 'koja-bench-cli-'));

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

// echo stands in for taskset, so the run prints the command line it was given instead of running it.
const echoPlacement: Placement = {
  cpus: [0, 1],
  source: 'hybrid-cpu-core',
  pinned: true,
  tasksetPath: '/bin/echo',
  reason: undefined,
};

const program = `${process.execPath} ${join(repositoryRoot, 'src/index.ts')}`;

it('runs every Koja command on the run CPUs, with the run socket', async () => {
  const koja = createKojaRunner(folder, '/tmp/run/koja.sock', {}, echoPlacement);

  const listed = await koja('pane', 'list', '--json');

  expect(listed.stdout).toBe(`-c 0,1 ${program} pane list --json --socket /tmp/run/koja.sock\n`);
});

it('runs the start-up control command on the run CPUs', async () => {
  const cli = createCliRunner(folder, {}, echoPlacement);

  const version = await cli('--version');

  expect(version.stdout).toBe(`-c 0,1 ${program} --version\n`);
});
