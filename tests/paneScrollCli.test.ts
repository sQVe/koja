import { expect, it, onTestFinished } from 'bun:test';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs, environmentFor, root } from './cliHarness.ts';
import { pollUntil, readJson, setup } from './paneHarness.ts';
import type { PhiRunner } from './paneHarness.ts';

const clientListSchema = z.array(
  z.object({ id: z.string(), view: z.object({ scrolls: z.record(z.string(), z.number()) }) }),
);

const scrollSchema = z.object({ scrolled: z.boolean(), client: z.string().optional() });

const failureSchema = z.object({ scrolled: z.literal(false), reason: z.string() });

const listClients = async (phi: PhiRunner) => {
  const listed = await phi('client', 'list', '--json');

  expect(listed.exitCode).toBe(0);

  return clientListSchema.parse(JSON.parse(listed.stdout));
};

const attach = (directory: string): void => {
  const socketPath = join(directory, 'run', 'phi.sock');

  const child = Bun.spawn(['bun', join(root, 'src/index.ts'), 'attach', '--socket', socketPath], {
    env: { ...environmentFor(directory), TERM: 'xterm' },
    terminal: { cols: 80, rows: 24, data: () => undefined },
  });

  onTestFinished(async () => {
    child.kill();
    await child.exited;
    child.terminal?.close();
  });
};

it(
  'scrolls the view of the attached client to the oldest row of a pane',
  async () => {
    const { directory, phi, first } = await setup('seq 1 200\nprintf done');

    attach(directory);

    const attached = await pollUntil(
      () => listClients(phi),
      (clients) => clients.length === 1,
    );

    const client = attached[0]?.id ?? '';
    const oldest = (await readJson(phi, first, '--lines', '1')).oldest;

    const result = await phi('pane', 'scroll', first, '--to', 'top');

    expect(result.exitCode).toBe(0);
    expect(scrollSchema.parse(JSON.parse(result.stdout))).toEqual({ scrolled: true, client });

    const [scrolled] = await listClients(phi);

    expect(scrolled?.view.scrolls).toEqual({ [first]: oldest });

    const row = await phi('pane', 'scroll', first, '--to', '5');

    expect(row.exitCode).toBe(0);

    const [atRow] = await listClients(phi);

    expect(atRow?.view.scrolls).toEqual({ [first]: 5 });

    const back = await phi('pane', 'scroll', first, '--to', 'bottom');

    expect(back.exitCode).toBe(0);

    const [followed] = await listClients(phi);

    expect(followed?.view.scrolls).toEqual({});
  },
  cliTestTimeoutMs,
);

it(
  'fails with noClient when no client is attached',
  async () => {
    const { phi, first } = await setup();

    const result = await phi('pane', 'scroll', first, '--to', 'top');

    expect(result.exitCode).toBe(1);

    expect(failureSchema.parse(JSON.parse(result.stdout))).toEqual({
      scrolled: false,
      reason: 'noClient',
    });
  },
  cliTestTimeoutMs,
);
