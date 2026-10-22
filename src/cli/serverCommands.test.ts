import { expect, it, onTestFinished } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BuildVersion } from '../protocol/protocol.ts';
import { serverContextFor } from './serverCommands.ts';

const version: BuildVersion = { version: '0.0.0', ghostty: 'test' };

const logPathOf = (socket: string, stateHome: string): string =>
  serverContextFor(socket, false, version, { XDG_STATE_HOME: stateHome }).logPath;

it('gives different sockets different log files', () => {
  const stateHome = '/tmp/koja-test-state';

  expect(logPathOf('/tmp/koja-test-one/a.sock', stateHome)).not.toBe(
    logPathOf('/tmp/koja-test-two/a.sock', stateHome),
  );
});

it('gives a socket reached through a symlink the log file of its real path', () => {
  const root = mkdtempSync(join(tmpdir(), 'koja-server-commands-'));

  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const real = join(root, 'real');
  const link = join(root, 'link');
  mkdirSync(join(real, 'run'), { recursive: true });
  symlinkSync(real, link);

  const stateHome = join(root, 'state');

  const viaLink = serverContextFor(join(link, 'run', 'a.sock'), false, version, {
    XDG_STATE_HOME: stateHome,
  });

  expect(viaLink.socketPath).toBe(join(link, 'run', 'a.sock'));
  expect(viaLink.logPath).toBe(logPathOf(join(real, 'run', 'a.sock'), stateHome));
});
