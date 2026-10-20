import { expect, it, onTestFinished } from 'bun:test';

import { paneId, tabId, workspaceId } from '../src/ids.ts';
import { spawnPane } from '../src/server/pane.ts';
import type { PaneRuntime } from '../src/server/pane.ts';

interface Calls {
  outputs: number;
  failures: string[];
}

const signal = (): { promise: Promise<undefined>; fire: (value: undefined) => void } => {
  const { promise, resolve } = Promise.withResolvers<undefined>();

  return { promise, fire: resolve };
};

const spawn = (onOutput: () => void, onFailed: () => void, calls: Calls): PaneRuntime => {
  const spawned = spawnPane({
    generation: 1,
    size: { columns: 40, rows: 10 },
    environment: { SHELL: '/bin/sh', PATH: process.env.PATH },
    identity: {
      paneId: paneId(1),
      tabId: tabId(1),
      workspaceId: workspaceId(1),
      socketPath: '/tmp/koja-test.sock',
      binaryPath: '/tmp/koja-test',
      version: 'test',
    },
    directory: process.cwd(),
    useScope: false,
    onOutput: () => {
      calls.outputs += 1;
      onOutput();
    },
    onRenumbered: () => {},
    onBell: () => {},
    onClipboard: () => {},
    onFailed: (message) => {
      calls.failures.push(message);
      onFailed();
    },
  });

  if (!spawned.ok) {
    throw new Error(spawned.message);
  }

  const { pane } = spawned;

  onTestFinished(() => {
    pane[Symbol.dispose]();
  });

  return pane;
};

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

it('reports the first output failure once and ignores the output after it', async () => {
  const calls: Calls = { outputs: 0, failures: [] };
  const failed = signal();

  const pane = spawn(
    () => {
      throw new Error('output rejected');
    },
    () => {
      failed.fire(undefined);
    },
    calls,
  );

  pane.write(encode('echo first\n'));
  await failed.promise;

  pane.write(encode('echo second\nexit\n'));
  await pane.exited;

  expect(calls.failures).toEqual(['output rejected']);
  expect(calls.outputs).toBe(1);
});

it('keeps handling output while nothing throws', async () => {
  const calls: Calls = { outputs: 0, failures: [] };
  const printed = signal();
  const current: { pane?: PaneRuntime } = {};

  const pane = spawn(
    () => {
      if (current.pane?.text().includes('hello') === true) {
        printed.fire(undefined);
      }
    },
    () => {},
    calls,
  );

  current.pane = pane;
  pane.write(encode('echo hello\n'));
  await printed.promise;

  expect(calls.outputs).toBeGreaterThan(0);
  expect(calls.failures).toEqual([]);

  pane.write(encode('exit\n'));
  await pane.exited;
});
