import { expect, it } from 'bun:test';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { startServer, temporaryDirectory, waitFor } from './serverHarness.ts';

it('starts a pane shell with the Koja environment and none of the server markers', async () => {
  const directory = await temporaryDirectory();

  const { server, socketPath } = await startServer(
    directory,
    '/bin/sh',
    process.env.PATH,
    undefined,
    { TMUX: '/tmp/tmux-1/default,1,0' },
  );

  const dumpPath = join(directory, 'env.txt');

  server.writeToPane(`env > ${dumpPath}.tmp && mv ${dumpPath}.tmp ${dumpPath}\n`);
  await waitFor(() => existsSync(dumpPath));

  const lines = readFileSync(dumpPath, 'utf8').split('\n');
  const claimedSocketPath = `${realpathSync(directory)}/run/koja.sock`;

  expect(socketPath).toContain(directory);
  expect(lines).toContain('KOJA_ENV=1');
  expect(lines).toContain('KOJA_WORKSPACE_ID=workspace-1');
  expect(lines).toContain('KOJA_TAB_ID=tab-1');
  expect(lines).toContain('KOJA_PANE_ID=pane-1');
  expect(lines).toContain(`KOJA_SOCKET_PATH=${claimedSocketPath}`);
  expect(lines).toContain(`KOJA_BIN_PATH=${process.execPath}`);
  expect(lines).toContain('TERM=xterm-256color');
  expect(lines).toContain('COLORTERM=truecolor');
  expect(lines).toContain('TERM_PROGRAM=koja');
  expect(lines).toContain('TERM_PROGRAM_VERSION=1.2.3');
  expect(lines.some((line) => line.startsWith('TMUX'))).toBe(false);
});
