import { expect, it } from 'bun:test';
import { readdirSync, readlinkSync } from 'node:fs';
import { chmod, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { scopeAvailable } from '../src/server/scope.ts';
import { cliTestTimeoutMs, temporaryDirectory } from './cliHarness.ts';
import type { TestServer } from './sessionHarness.ts';
import { setup, buildSetup } from './sessionHarness.ts';

it(
  'starts each restored shell in its last folder',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();

    await server.createWorkspace('one');
    await server.useLegacy('tab-1');

    const second = await server.split('pane-1');

    const firstFolder = await realpath(await temporaryDirectory());
    const secondFolder = await realpath(await temporaryDirectory());

    await server.koja(['pane', 'focus', 'pane-1']);
    await server.koja(['pane', 'send', `cd ${firstFolder}\n`]);
    await server.koja(['pane', 'focus', second]);
    await server.koja(['pane', 'send', `cd ${secondFolder}\n`]);

    const deadline = performance.now() + 10_000;
    let folders = await server.folders();

    while (folders['pane-1'] !== firstFolder || folders[second] !== secondFolder) {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
      folders = await server.folders();
    }

    await server.koja(['server', 'stop']);
    await server.start();

    expect(await server.folders()).toEqual({ 'pane-1': firstFolder, [second]: secondFolder });
  },
  cliTestTimeoutMs,
);

const foregroundFolders = async (server: TestServer): Promise<Record<string, string | null>> => {
  const listed = z
    .array(z.object({ id: z.string(), foreground_cwd: z.string().nullable() }))
    .parse(JSON.parse(await server.koja(['pane', 'list', '--json'])));

  return Object.fromEntries(listed.map((pane) => [pane.id, pane.foreground_cwd]));
};

const layoutOf = async (server: TestServer): Promise<string> => {
  const workspaces = await server.koja(['workspace', 'list', '--json']);
  const tabs = await server.koja(['tab', 'list', '--json']);

  return `${workspaces}\n${tabs}`;
};

it(
  'keeps a pane whose saved folder is gone',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();
    await server.createWorkspace('one');
    await server.useLegacy('tab-1');

    const second = await server.split('pane-1');
    const gone = await realpath(await temporaryDirectory());

    await server.koja(['pane', 'focus', second]);
    await server.koja(['pane', 'send', `cd ${gone}\n`]);

    const deadline = performance.now() + 10_000;

    while ((await server.folders())[second] !== gone) {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
    }

    const layoutBefore = await layoutOf(server);

    await server.koja(['server', 'stop']);
    await rm(gone, { recursive: true, force: true });
    await server.start();

    const states = await server.states();

    expect(states['pane-1']).toEqual({ lifecycle: 'running', error: null });
    expect(states[second]?.lifecycle).toBe('failed');

    expect(states[second]?.error).toBe(
      `Saved folder ${gone} is unavailable. Restore the folder and restart the Koja server.`,
    );

    expect(await layoutOf(server)).toBe(layoutBefore);
    expect((await server.folders())[second]).toBe(gone);
    expect((await foregroundFolders(server))[second]).toBeNull();
  },
  cliTestTimeoutMs,
);

it(
  'keeps every pane when the shell cannot start after a restart',
  async () => {
    const { serverAt, environment } = await setup();
    const server = serverAt('koja');

    await server.start();
    await buildSetup(server);

    const layoutBefore = await layoutOf(server);
    const paneIds = Object.keys(await server.states());

    await server.koja(['server', 'stop']);

    environment.SHELL = '/bin/koja-missing-shell';
    await server.start();

    const states = await server.states();

    expect(Object.keys(states)).toEqual(paneIds);

    for (const state of Object.values(states)) {
      expect(state.lifecycle).toBe('failed');
      expect(state.error).toStartWith('Could not start the saved shell: ');
      expect(state.error).toContain('/bin/koja-missing-shell');
      expect(state.error).toEndWith('Fix the shell configuration and restart the Koja server.');
      expect(state.error).not.toContain('..');
    }

    expect(await layoutOf(server)).toBe(layoutBefore);
  },
  cliTestTimeoutMs,
);

it(
  'restores a failed pane once its folder is back, and closes it on request',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();
    await server.createWorkspace('one');
    await server.useLegacy('tab-1');

    const second = await server.split('pane-1');
    // The folder moves to a sibling, so it sits inside a directory that cleanup removes.
    const folder = join(await realpath(await temporaryDirectory()), 'moving');

    await mkdir(folder);
    await server.koja(['pane', 'focus', second]);
    await server.koja(['pane', 'send', `cd ${folder}\n`]);

    const deadline = performance.now() + 10_000;

    while ((await server.folders())[second] !== folder) {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
    }

    await server.koja(['server', 'stop']);
    await rename(folder, `${folder}-away`);
    await server.start();

    expect((await server.states())[second]?.lifecycle).toBe('failed');

    await server.koja(['server', 'stop']);
    await rename(`${folder}-away`, folder);
    await server.start();

    expect((await server.states())[second]).toEqual({ lifecycle: 'running', error: null });
    expect((await server.folders())[second]).toBe(folder);

    await server.koja(['server', 'stop']);
    await rename(folder, `${folder}-away`);
    await server.start();
    await server.koja(['pane', 'close', second]);

    expect(Object.keys(await server.states())).toEqual(['pane-1']);
  },
  cliTestTimeoutMs,
);

const scopesAvailable = scopeAvailable(process.env);

const writeShell = async (path: string, script: string): Promise<void> => {
  await writeFile(path, script);
  await chmod(path, 0o700);
};

it.skipIf(!scopesAvailable)(
  'keeps a restored pane failed when its scoped shell cannot execute',
  async () => {
    const { serverAt, environment } = await setup();
    const server = serverAt('koja');
    const shell = join(await temporaryDirectory(), 'shell');

    environment.SHELL = shell;
    environment.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR;
    await writeShell(shell, '#!/bin/sh\nexec /bin/sh\n');
    await server.start();
    await server.createWorkspace('one');
    await server.koja(['server', 'stop']);
    await writeShell(shell, '#!/nonexistent/koja-interpreter\n');
    await server.start();

    const deadline = performance.now() + 10_000;
    let states = await server.states();

    while (states['pane-1']?.lifecycle === 'running') {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
      states = await server.states();
    }

    expect(states['pane-1']?.lifecycle).toBe('failed');

    expect(states['pane-1']?.error).toStartWith(
      'Could not start the saved shell: Failed to execute',
    );

    expect(states['pane-1']?.error).toEndWith(
      'Fix the shell configuration and restart the Koja server.',
    );
  },
  cliTestTimeoutMs,
);

const terminalDescriptorCount = (pid: number): number =>
  readdirSync(`/proc/${pid}/fd`).filter((entry) => {
    try {
      return readlinkSync(`/proc/${pid}/fd/${entry}`) === '/dev/ptmx';
    } catch {
      return false;
    }
  }).length;

it.skipIf(!scopesAvailable)(
  'keeps a narrow restored pane failed, and releases its terminal',
  async () => {
    const { serverAt, environment } = await setup();
    const server = serverAt('koja');
    const shell = join(await temporaryDirectory(), 'shell');

    environment.SHELL = shell;
    environment.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR;
    await writeShell(shell, '#!/bin/sh\nexec /bin/sh\n');
    await server.start();
    await server.createWorkspace('one');
    await server.useLegacy('tab-1');

    let last = 'pane-1';

    for (let count = 0; count < 3; count++) {
      last = await server.split(last);
    }

    await server.koja(['server', 'stop']);
    await writeShell(shell, '#!/nonexistent/koja-interpreter\n');

    const pid = await server.start();
    const deadline = performance.now() + 10_000;
    let states = await server.states();

    while (Object.values(states).some((state) => state.lifecycle === 'running')) {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
      states = await server.states();
    }

    expect(Object.keys(states)).toHaveLength(4);

    for (const state of Object.values(states)) {
      expect(state.lifecycle).toBe('failed');

      expect(state.error).toBe(
        'Could not start the saved shell: Failed to execute: No such file or directory. Fix the shell configuration and restart the Koja server.',
      );
    }

    const columns = JSON.parse(await server.koja(['pane', 'list', '--json'])) as {
      columns: number;
    }[];

    expect(Math.min(...columns.map((pane) => pane.columns))).toBeLessThan(17);
    expect(terminalDescriptorCount(pid)).toBe(0);
  },
  cliTestTimeoutMs,
);

it.skipIf(!scopesAvailable)(
  'closes a restored scoped pane whose shell exits 1 without an exec failure message',
  async () => {
    const { serverAt, environment } = await setup();
    const server = serverAt('koja');
    const shell = join(await temporaryDirectory(), 'shell');

    environment.SHELL = shell;
    environment.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR;
    await writeShell(shell, '#!/bin/sh\nexec /bin/sh\n');
    await server.start();
    await server.createWorkspace('one');
    await server.koja(['server', 'stop']);
    await writeShell(shell, '#!/bin/sh\nexit 1\n');
    await server.start();

    const deadline = performance.now() + 10_000;

    while (Object.keys(await server.states()).length > 0) {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
    }

    expect(await server.states()).toEqual({});
    expect(await server.workspaceIds()).toEqual(['workspace-1']);
  },
  cliTestTimeoutMs,
);

const restartWithShell = async (script: string, panes: number) => {
  const { serverAt, environment } = await setup();
  const server = serverAt('koja');
  const shell = join(await temporaryDirectory(), 'shell');

  environment.SHELL = shell;
  environment.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR;
  await writeShell(shell, '#!/bin/sh\nexec /bin/sh\n');
  await server.start();
  await server.createWorkspace('one');
  await server.useLegacy('tab-1');

  for (let count = 1; count < panes; count++) {
    await server.split('pane-1');
  }

  await server.koja(['server', 'stop']);
  await writeShell(shell, script);
  await server.start();

  return server;
};

it.skipIf(!scopesAvailable)(
  'closes a restored scoped pane whose shell prints the message across two hard lines',
  async () => {
    const server = await restartWithShell(
      "#!/bin/sh\nprintf 'Failed to ex\\necute: No such file\\n'\nexit 1\n",
      1,
    );

    const deadline = performance.now() + 10_000;

    while (Object.keys(await server.states()).length > 0) {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
    }

    expect(await server.states()).toEqual({});
    expect(await server.workspaceIds()).toEqual(['workspace-1']);
  },
  cliTestTimeoutMs,
);

it.skipIf(!scopesAvailable)(
  'keeps a restored scoped pane failed with the exact message after it was resized narrower',
  async () => {
    const server = await restartWithShell(
      "#!/bin/sh\nsleep 1\nprintf 'before\\nFailed to execute: No such file or directory\\nafter\\n'\nexit 1\n",
      2,
    );

    await server.koja(['pane', 'resize', 'pane-1', '--direction', 'left', '--cells', '100']);

    const deadline = performance.now() + 10_000;
    let states = await server.states();

    while (states['pane-1']?.lifecycle !== 'failed') {
      expect(performance.now()).toBeLessThan(deadline);
      await Bun.sleep(20);
      states = await server.states();
    }

    expect(states['pane-1'].error).toBe(
      'Could not start the saved shell: Failed to execute: No such file or directory. Fix the shell configuration and restart the Koja server.',
    );
  },
  cliTestTimeoutMs,
);
