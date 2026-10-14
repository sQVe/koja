import { expect, it } from 'bun:test';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { startServer, temporaryDirectory, waitFor } from './serverHarness.ts';

it('starts a pane shell with the Phi environment and none of the server markers', async () => {
  const directory = await temporaryDirectory();

  const { server, socketPath } = await startServer(
    directory,
    '/bin/sh',
    process.env.PATH,
    undefined,
    { TMUX: '/tmp/tmux-1/default,1,0', HERDR_ENV: '1' },
  );

  const dumpPath = join(directory, 'env.txt');

  server.writeToPane(`env > ${dumpPath}.tmp && mv ${dumpPath}.tmp ${dumpPath}\n`);
  await waitFor(() => existsSync(dumpPath));

  const lines = readFileSync(dumpPath, 'utf8').split('\n');
  const claimedSocketPath = `${realpathSync(directory)}/run/phi.sock`;

  expect(socketPath).toContain(directory);
  expect(lines).toContain('PHI_ENV=1');
  expect(lines).toContain('PHI_WORKSPACE_ID=workspace-1');
  expect(lines).toContain('PHI_TAB_ID=tab-1');
  expect(lines).toContain('PHI_PANE_ID=pane-1');
  expect(lines).toContain(`PHI_SOCKET_PATH=${claimedSocketPath}`);
  expect(lines).toContain(`PHI_BIN_PATH=${process.execPath}`);
  expect(lines).toContain('TERM=xterm-256color');
  expect(lines).toContain('COLORTERM=truecolor');
  expect(lines).toContain('TERM_PROGRAM=phi');
  expect(lines).toContain('TERM_PROGRAM_VERSION=1.2.3');
  expect(lines.some((line) => line.startsWith('TMUX'))).toBe(false);
  expect(lines.some((line) => line.startsWith('HERDR_'))).toBe(false);
});
