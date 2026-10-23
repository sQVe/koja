import { expect, it, onTestFinished, spyOn } from 'bun:test';

import * as client from '../client/client.ts';
import { paneId } from '../ids.ts';
import { runPaneReadCommand } from './paneReadCommand.ts';

it('reports pending read overload as a command failure without retrying', async () => {
  const readPane = spyOn(client, 'runPaneRead').mockResolvedValue({
    ok: false,
    reason: 'tooManyPendingReads',
    limit: 64,
  });

  onTestFinished(() => {
    readPane.mockRestore();
  });

  const read = {
    action: 'read',
    pane: paneId(1),
    source: 'visible',
    lines: undefined,
    range: undefined,
  } as const;

  const command = { kind: 'pane', pane: read, json: false, socket: '/tmp/koja.sock' } as const;

  const result = await runPaneReadCommand(
    command,
    read,
    { version: 'test', ghostty: 'test' },
    command.socket,
  );

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error('The overloaded read succeeded');
  }

  expect(result.message).toContain('64');
  expect(result.message).toContain('waiting');
  expect(readPane).toHaveBeenCalledTimes(1);
});
