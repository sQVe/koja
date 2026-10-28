import { expect, it, onTestFinished, spyOn } from 'bun:test';

import * as client from '../client/client.ts';
import type { PiRecoveryStatus } from '../client/client.ts';
import { paneId } from '../ids.ts';
import { runPiAction } from './piCommands.ts';

const version = { version: 'test', ghostty: 'test' };

const statusOutput = async (recovery: PiRecoveryStatus, json: boolean): Promise<string> => {
  const status = spyOn(client, 'runPiStatus').mockResolvedValue({ ok: true, pi: null, recovery });
  const written: string[] = [];

  const write = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    written.push(String(chunk));

    return true;
  });

  onTestFinished(() => {
    status.mockRestore();
    write.mockRestore();
  });

  const command = {
    kind: 'pi',
    pi: { action: 'status', pane: paneId(1) },
    json,
    socket: '/tmp/koja.sock',
  } as const;

  const result = await runPiAction(command, version, {});

  write.mockRestore();

  expect(result).toEqual({ ok: true });

  return written.join('');
};

it.each<[string, PiRecoveryStatus, unknown]>([
  ['no restore check', null, null],
  ['a ready restore check', { status: 'ready' }, { status: 'ready', reason: null }],
  [
    'a failed restore check',
    { status: 'failed', reason: 'sessionFileMissing' },
    { status: 'failed', reason: 'sessionFileMissing' },
  ],
  [
    'a blocked restore check',
    { status: 'blocked', reason: 'externalWorker' },
    { status: 'blocked', reason: 'externalWorker' },
  ],
])('prints %s of a pane as JSON', async (_name, recovery, printed) => {
  const output = await statusOutput(recovery, true);

  expect(JSON.parse(output)).toEqual({ pane: 'pane-1', pi: null, recovery: printed });
});

it('prints no restore line as text for a pane without a restore check', async () => {
  const lines = (await statusOutput(null, false)).trimEnd().split('\n');

  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('pane-1');
});

it.each<[string, NonNullable<PiRecoveryStatus>]>([
  ['a ready restore check', { status: 'ready' }],
  ['a failed restore check', { status: 'failed', reason: 'sessionFileMissing' }],
  ['a blocked restore check', { status: 'blocked', reason: 'externalWorker' }],
])('prints %s of a pane as a second text line that names its status', async (_name, recovery) => {
  const lines = (await statusOutput(recovery, false)).trimEnd().split('\n');

  expect(lines).toHaveLength(2);
  expect(lines[1]).toContain(recovery.status);
});

const reasonOf = (output: string): string | undefined =>
  output.trimEnd().split('\n')[1]?.split(':')[1]?.trim();

it('names a different reason for a failed and a blocked restore check as text', async () => {
  const failed = await statusOutput({ status: 'failed', reason: 'sessionFileMissing' }, false);
  const blocked = await statusOutput({ status: 'blocked', reason: 'externalWorker' }, false);

  expect(reasonOf(failed)).toBeTruthy();
  expect(reasonOf(blocked)).toBeTruthy();
  expect(reasonOf(failed)).not.toBe(reasonOf(blocked));
});

it('names no reason for a ready restore check as text', async () => {
  expect(reasonOf(await statusOutput({ status: 'ready' }, false))).toBeUndefined();
});
