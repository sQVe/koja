import { expect, it, onTestFinished } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { paneId } from '../src/ids.ts';
import { createFrameDecoder, encodeFrame, FrameKind } from '../src/protocol/frames.ts';
import { encodeControl } from '../src/protocol/messages.ts';
import { decodeRowUpdate, rowsToLines } from '../src/rows/rows.ts';
import type { RowUpdate } from '../src/rows/rows.ts';
import {
  buildVersion,
  cliTestTimeoutMs,
  environmentFor,
  runCli,
  startServer,
  temporaryDirectory,
} from './cliHarness.ts';
import type { CliRun } from './cliHarness.ts';
import { createWorkspaceAt, waitFor } from './serverProcesses.ts';

const paneOutputSchema = z.object({
  pane: z.string(),
  lines: z.array(z.string()),
  source: z.string(),
});

it(
  'reads 24 visible rows and the shell prompt without a terminal client',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'run', 'koja.sock');
    const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: 'koja-test> ' };

    const started = await runCli(
      ['server', 'start', '--socket', socketPath],
      directory,
      environment,
    );

    expect(started.exitCode).toBe(0);
    await createWorkspaceAt(socketPath, directory);

    let text: CliRun = { exitCode: -1, stdout: '', stderr: '' };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      text = await runCli(['pane', 'read', 'pane-1', '--socket', socketPath], directory);

      if (text.stdout.includes('koja-test>')) {
        break;
      }
    }

    const json = await runCli(
      ['pane', 'read', 'pane-1', '--socket', socketPath, '--json'],
      directory,
    );

    expect(json.exitCode).toBe(0);
    const output = paneOutputSchema.parse(JSON.parse(json.stdout));

    expect(output.pane).toBe('pane-1');
    expect(output.source).toBe('recent');
    expect(output.lines).toEqual(['koja-test>']);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toBe('koja-test>\n');

    const visible = await runCli(
      ['pane', 'read', 'pane-1', '--source', 'visible', '--socket', socketPath, '--json'],
      directory,
    );

    expect(paneOutputSchema.parse(JSON.parse(visible.stdout)).lines).toEqual(['koja-test>']);
  },
  cliTestTimeoutMs,
);

it(
  'refuses pane read without a pane id, with the usage on stderr and nothing on stdout',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'run', 'koja.sock');

    await startServer(directory, socketPath);
    await createWorkspaceAt(socketPath, directory);

    const refused = await runCli(['pane', 'read', '--socket', socketPath], directory);

    expect(refused.exitCode).not.toBe(0);
    expect(refused.stdout).toBe('');
    expect(refused.stderr).toContain('Usage');

    const flagged = await runCli(
      ['pane', 'read', '--pane', 'pane-1', '--socket', socketPath],
      directory,
    );

    expect(flagged.exitCode).not.toBe(0);
    expect(flagged.stdout).toBe('');
  },
  cliTestTimeoutMs,
);

it(
  'sends text to the pane without a terminal client and reads the result',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'run', 'koja.sock');

    await startServer(directory, socketPath);

    const sent = await runCli(
      ['pane', 'send', 'agent-text-中文-é', '--socket', socketPath, '--json'],
      directory,
    );

    expect(sent).toEqual({ exitCode: 0, stdout: '{"sent":true}\n', stderr: '' });

    const read = await runCli(
      ['pane', 'read', 'pane-1', '--socket', socketPath, '--json'],
      directory,
    );

    expect(read.exitCode).toBe(0);
    const output = paneOutputSchema.parse(JSON.parse(read.stdout));

    expect(output.lines.join('\n')).toContain('agent-text-中文-é');

    const silent = await runCli(['pane', 'send', '', '--socket', socketPath], directory);

    expect(silent).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  },
  cliTestTimeoutMs,
);

it(
  'reads the active screen rather than history after scrolling and on the alternate screen',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'run', 'koja.sock');
    const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

    const started = await runCli(
      ['server', 'start', '--socket', socketPath],
      directory,
      environment,
    );

    expect(started.exitCode).toBe(0);
    await createWorkspaceAt(socketPath, directory);

    const lines = Array.from({ length: 35 }, (_, row) => `line-${row}`);
    const screen = lines.join('\\r\\n');
    const text = `printf '\\033[2J\\033[H${screen}'; : > primary-ready\n`;
    const sent = await runCli(['pane', 'send', text, '--socket', socketPath], directory);

    expect(sent.exitCode).toBe(0);
    expect(await waitFor(() => existsSync(join(directory, 'primary-ready')))).toBe(true);

    const primary = await runCli(
      ['pane', 'read', 'pane-1', '--source', 'visible', '--socket', socketPath, '--json'],
      directory,
    );

    const primaryOutput = paneOutputSchema.parse(JSON.parse(primary.stdout));

    expect(primaryOutput.lines).toEqual(lines.slice(-24));

    const alternateText = "printf '\\033[?1049h\\033[Halternate-screen'; : > alternate-ready\n";

    const alternateSent = await runCli(
      ['pane', 'send', alternateText, '--socket', socketPath],
      directory,
    );

    expect(alternateSent.exitCode).toBe(0);
    expect(await waitFor(() => existsSync(join(directory, 'alternate-ready')))).toBe(true);

    const alternate = await runCli(
      ['pane', 'read', 'pane-1', '--source', 'visible', '--socket', socketPath, '--json'],
      directory,
    );

    const alternateOutput = paneOutputSchema.parse(JSON.parse(alternate.stdout));

    expect(alternateOutput.lines).toEqual(['alternate-screen']);
  },
  cliTestTimeoutMs,
);

const connectTerminal = async (socketPath: string) => {
  const decoder = createFrameDecoder();
  const updates: RowUpdate[] = [];
  const failures: string[] = [];

  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data: (connection, bytes) => {
        const decoded = decoder.push(bytes);

        if (!decoded.ok) {
          failures.push(decoded.reason);

          return;
        }

        for (const frame of decoded.frames) {
          if (frame.kind !== FrameKind.rowUpdate) {
            continue;
          }

          const result = decodeRowUpdate(frame.payload);

          if (result.ok) {
            const { pane, sequence } = result.update;
            const ack = encodeControl({ type: 'ack', paneId: paneId(pane), sequence });

            updates.push(result.update);
            connection.write(encodeFrame(FrameKind.control, ack));
          } else {
            failures.push(result.reason);
          }
        }
      },
    },
  });

  onTestFinished(() => {
    socket.end();
  });

  const hello = encodeControl({
    type: 'hello',
    version: buildVersion(),
    size: { columns: 80, rows: 25 },
  });

  socket.write(encodeFrame(FrameKind.control, hello));

  return { updates, failures };
};

it(
  'keeps publishing every changed row to a connected terminal during repeated agent reads',
  async () => {
    const directory = await temporaryDirectory();
    const socketPath = join(directory, 'run', 'koja.sock');
    const environment = { ...environmentFor(directory), SHELL: '/bin/sh', PS1: '' };

    expect(
      (await runCli(['server', 'start', '--socket', socketPath], directory, environment)).exitCode,
    ).toBe(0);

    await createWorkspaceAt(socketPath, directory);

    const terminal = await connectTerminal(socketPath);

    expect(await waitFor(() => terminal.updates.length > 0)).toBe(true);
    expect(terminal.updates[0]?.rowCount).toBe(24);

    for (let change = 0; change < 3; change += 1) {
      const expected = Array.from({ length: 20 }, (_, row) => `change-${change}-row-${row}`);
      const screen = expected.join('\\r\\n');
      const command = `printf '\\033[2J\\033[H${screen}'\n`;
      const start = terminal.updates.length;
      const sent = runCli(['pane', 'send', command, '--socket', socketPath], directory);

      const reads = Array.from({ length: 5 }, () =>
        runCli(
          ['pane', 'read', 'pane-1', '--source', 'visible', '--socket', socketPath, '--json'],
          directory,
        ),
      );

      const results = await Promise.all([sent, ...reads]);

      expect(results.every((result) => result.exitCode === 0)).toBe(true);

      const receivedRows = () =>
        terminal.updates
          .slice(start)
          .flatMap((update) => rowsToLines(update, update.size.columns, false));

      expect(await waitFor(() => expected.every((row) => receivedRows().includes(row)))).toBe(true);
      const received = receivedRows();

      for (const row of expected) {
        expect(received).toContain(row);
      }

      const read = await runCli(
        ['pane', 'read', 'pane-1', '--source', 'visible', '--socket', socketPath, '--json'],
        directory,
      );

      const output = paneOutputSchema.parse(JSON.parse(read.stdout));

      expect(output.lines.slice(0, 20)).toEqual(expected);
    }

    expect(terminal.failures).toEqual([]);
  },
  cliTestTimeoutMs,
);

it.each(['read', 'send'] as const)(
  'exits 1 without output when pane %s finds no server',
  async (action) => {
    const directory = await temporaryDirectory();
    const argumentsForAction = ['pane', action, action === 'send' ? 'text' : 'pane-1'];

    const result = await runCli(
      [...argumentsForAction, '--socket', join(directory, 'absent.sock'), '--json'],
      directory,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('absent.sock');
  },
  cliTestTimeoutMs,
);
