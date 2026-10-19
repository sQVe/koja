import { afterAll, beforeAll, expect, it, onTestFinished } from 'bun:test';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import packageJson from '../package.json' with { type: 'json' };
import { root, startOutputSchema } from './cliHarness.ts';
import { endServersIn, isRunning, serverProcessesIn, waitFor } from './serverProcesses.ts';

let source: string;
let directory: string;

const pinnedGhosttyCommit = async () => {
  const script = await readFile(join(root, 'scripts/buildVt.sh'), 'utf8');
  const commit = /^ghostty_commit=([0-9a-f]{40})$/m.exec(script)?.[1];

  if (commit === undefined) {
    throw new Error('scripts/buildVt.sh has no Ghostty pin.');
  }

  return commit;
};

// Compiles from a copy of the sources and deletes the copy, so the library path the compiler saw no
// longer exists and the binary can only load its embedded library.
const compileFromCopy = async () => {
  await cp(join(root, 'src'), join(source, 'src'), { recursive: true });
  await cp(join(root, 'package.json'), join(source, 'package.json'));
  await symlink(join(root, 'node_modules'), join(source, 'node_modules'));
  await mkdir(join(source, 'build'));
  await cp(join(root, 'build/libkoja-vt.so'), join(source, 'build/libkoja-vt.so'));

  const build = Bun.spawnSync(
    ['bun', 'build', '--compile', 'src/index.ts', '--outfile', join(directory, 'koja')],
    { cwd: source, stdout: 'pipe', stderr: 'pipe' },
  );

  if (build.exitCode !== 0) {
    throw new Error(build.stderr.toString());
  }

  await rm(source, { recursive: true, force: true });
};

beforeAll(async () => {
  source = await mkdtemp(join(tmpdir(), 'koja-binary-source-'));
  directory = await mkdtemp(join(tmpdir(), 'koja-binary-'));

  await compileFromCopy();
});

afterAll(async () => {
  await rm(source, { recursive: true, force: true });
  await rm(directory, { recursive: true, force: true });
});

it('prints the version and the pinned Ghostty commit without the library it was compiled from', async () => {
  const run = Bun.spawnSync([join(directory, 'koja'), '--version', '--json'], {
    cwd: directory,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect({ exitCode: run.exitCode, stderr: run.stderr.toString() }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  const output: unknown = JSON.parse(run.stdout.toString());

  expect(output).toEqual({ version: packageJson.version, ghostty: await pinnedGhosttyCommit() });
  expect(packageJson.version).not.toBe('');
});

it('prints the version and the pinned Ghostty commit when run from source', async () => {
  const run = Bun.spawnSync(['bun', 'src/index.ts', '--version'], {
    cwd: root,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect({ exitCode: run.exitCode, stderr: run.stderr.toString() }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  expect(run.stdout.toString()).toMatch(
    new RegExp(`^koja \\S+ \\(ghostty ${await pinnedGhosttyCommit()}\\)\\n$`),
  );
});

it('runs the source entry file directly, as panes run KOJA_BIN_PATH', () => {
  const run = Bun.spawnSync([join(root, 'src/index.ts'), '--version'], {
    cwd: root,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect({ exitCode: run.exitCode, stderr: run.stderr.toString() }).toEqual({
    exitCode: 0,
    stderr: '',
  });
});

it('starts and stops a server', async () => {
  const state = await mkdtemp(join(tmpdir(), 'koja-binary-server-'));
  const socketPath = join(state, 'run', 'koja.sock');

  const runBinary = (commandArguments: string[]) =>
    Bun.spawnSync(
      [join(directory, 'koja'), 'server', ...commandArguments, '--socket', socketPath],
      {
        cwd: state,
        env: { ...process.env, XDG_STATE_HOME: join(state, 'state') },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

  onTestFinished(async () => {
    await endServersIn(state);
    await rm(state, { recursive: true, force: true });
  });

  const started = runBinary(['start', '--json']);

  expect({ exitCode: started.exitCode, stderr: started.stderr.toString() }).toEqual({
    exitCode: 0,
    stderr: '',
  });

  const output = startOutputSchema.parse(JSON.parse(started.stdout.toString()));

  expect(output.socket).toBe(socketPath);
  expect(serverProcessesIn(state)).toEqual([output.pid]);

  const stopped = runBinary(['stop', '--json']);

  expect({ exitCode: stopped.exitCode, stdout: stopped.stdout.toString() }).toEqual({
    exitCode: 0,
    stdout: '{"stopped":true}\n',
  });

  expect(existsSync(socketPath)).toBe(false);
  expect(await waitFor(() => !isRunning(output.pid))).toBe(true);
}, 30_000);
