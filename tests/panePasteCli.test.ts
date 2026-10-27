import { expect, it } from 'bun:test';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import {
  cliTestTimeoutMs,
  environmentFor,
  launchServer,
  runCli,
  temporaryDirectory,
} from './cliHarness.ts';
import { waitForText } from './paneHarness.ts';
import { createWorkspaceAt, waitFor } from './serverProcesses.ts';

const confirmationSchema = z.strictObject({
  status: z.literal('confirmationRequired'),
  pane: z.literal('pane-1'),
  generation: z.number().int(),
  lines: z.literal(2),
  authorization: z.string().regex(/^[0-9]+\.[0-9a-f]{64}$/),
});

const statusSchema = z.object({ status: z.string() });

const readReceived = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
};

// The shell copies every byte the pane gets, untranslated, to a file.
const recordingShell = async (directory: string, received: string): Promise<string> => {
  const path = join(directory, 'recording-shell.sh');

  await writeFile(path, `#!/bin/sh\nstty raw -echo\necho ready\nexec cat >> '${received}'\n`);
  await chmod(path, 0o755);

  return path;
};

it(
  'asks to confirm multiline text, sends it only with its authorization, and refuses it after a restart or for a missing pane',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'run', 'koja.sock');
    const received = join(directory, 'received');
    const shell = await recordingShell(directory, received);
    const environment = { ...environmentFor(directory), SHELL: shell };
    const root = join(directory, 'work');

    const koja = (...commandArguments: string[]) =>
      runCli([...commandArguments, '--socket', socketPath], directory, environment);

    // A single-line paste never needs confirmation. The file reaching `expected` shows that no
    // earlier paste wrote anything, since the pane gets bytes in order.
    const expectReceivedAfterMarker = async (expected: string): Promise<void> => {
      const marked = await koja('pane', 'paste', 'z', '--pane', 'pane-1', '--json');

      expect(statusSchema.parse(JSON.parse(marked.stdout)).status).toBe('sent');
      await waitFor(async () => (await readReceived(received)) === expected);
      expect(await readReceived(received)).toBe(expected);
    };

    await mkdir(root);
    await launchServer(socketPath, directory, environment);
    await createWorkspaceAt(socketPath, root);
    await waitForText(koja, 'pane-1', 'ready');

    const asked = await koja('pane', 'paste', 'a\nb', '--json');

    expect(asked.exitCode).not.toBe(0);
    expect(asked.stderr).toContain('--authorize');

    const { authorization } = confirmationSchema.parse(JSON.parse(asked.stdout));

    const otherText = await koja('pane', 'paste', 'a\nc', '--authorize', authorization, '--json');

    expect(otherText.exitCode).not.toBe(0);
    expect(JSON.parse(otherText.stdout)).toEqual({ status: 'authorizationMismatch' });
    await expectReceivedAfterMarker('z');

    const sent = await koja('pane', 'paste', 'a\nb', '--authorize', authorization, '--json');

    expect(sent.exitCode).toBe(0);
    expect(statusSchema.parse(JSON.parse(sent.stdout)).status).toBe('sent');
    await expectReceivedAfterMarker('za\rbz');

    const stopped = await koja('server', 'stop');

    expect(stopped.exitCode).toBe(0);
    await launchServer(socketPath, directory, environment);
    await waitForText(koja, 'pane-1', 'ready');

    const afterRestart = await koja(
      'pane',
      'paste',
      'a\nb',
      '--authorize',
      authorization,
      '--json',
    );

    expect(afterRestart.exitCode).not.toBe(0);
    expect(JSON.parse(afterRestart.stdout)).toEqual({ status: 'authorizationMismatch' });
    await expectReceivedAfterMarker('za\rbzz');

    const missing = await koja('pane', 'paste', 'a', '--pane', 'pane-9', '--json');

    expect(missing.exitCode).not.toBe(0);
    expect(JSON.parse(missing.stdout)).toEqual({ status: 'paneMissing', pane: 'pane-9' });
    expect(missing.stderr).toContain('The pane is no longer running.');
  },
  cliTestTimeoutMs,
);
