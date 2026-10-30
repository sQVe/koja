import { expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';

import { z } from 'zod';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { waitFor } from './serverProcesses.ts';
import { setup } from './sessionHarness.ts';

it(
  'keeps an empty workspace when its first tab cannot start in an unavailable directory',
  async () => {
    const { serverAt } = await setup();
    const server = serverAt('koja');

    await server.start();

    const workspace = await server.createWorkspace('retained');

    await server.koja(['workspace', 'rename', workspace, 'Retained label']);
    await server.koja(['pane', 'close', 'pane-1']);

    const before = await server.described();

    const workspaces = z
      .array(z.object({ root: z.string() }))
      .parse(JSON.parse(await server.koja(['workspace', 'list', '--json'])));

    const root = workspaces[0]?.root;

    if (root === undefined) {
      throw new Error('Missing workspace root.');
    }

    await rm(root, { recursive: true });

    const failed = await server.attempt(['tab', 'create', '--workspace', workspace]);

    expect(failed.exitCode).toBe(1);

    expect(await waitFor(async () => Object.keys(await server.states()).length === 0)).toBe(true);
    expect(await server.described()).toBe(before);
    expect(await server.workspaceIds()).toEqual([workspace]);

    await mkdir(root);
    await server.koja(['tab', 'create', '--workspace', workspace]);

    expect(Object.values(await server.states())).toEqual([{ lifecycle: 'running', error: null }]);
  },
  cliTestTimeoutMs,
);
