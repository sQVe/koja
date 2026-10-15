import { afterEach, expect, it } from 'bun:test';
import { join } from 'node:path';

import { BoxRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import type { TestRendererSetup } from '@opentui/core/testing';

import { connectAttach } from '../src/client/client.ts';
import type { AttachSession } from '../src/client/client.ts';
import { paneId } from '../src/ids.ts';
import { mountPanes } from '../src/ui/paneLayer.ts';
import { buildVersion, cliTestTimeoutMs } from './cliHarness.ts';
import { setup } from './paneHarness.ts';

const terminalSize = { columns: 100, rows: 30 };

let drawing: TestRendererSetup | undefined;
let attached: AttachSession | undefined;
let unmount: (() => void) | undefined;

afterEach(() => {
  unmount?.();
  attached?.close();
  drawing?.renderer.destroy();
  unmount = undefined;
  attached = undefined;
  drawing = undefined;
});

const history = 'seq 1 5000 | sed \'s/^/a/\'\nwhile read line; do echo "out $line"; done';

// Attaches in this process and draws the panes of the attached client into a test renderer.
const attachAndDraw = async (directory: string) => {
  const result = await connectAttach(
    join(directory, 'run', 'phi.sock'),
    buildVersion(),
    terminalSize,
  );

  if (!result.ok) {
    throw new Error(result.reason);
  }

  const { session } = result;

  const created = await createTestRenderer({
    width: terminalSize.columns,
    height: terminalSize.rows,
  });

  const box = new BoxRenderable(created.renderer, {
    width: terminalSize.columns,
    height: terminalSize.rows,
  });

  attached = session;
  session.resize(terminalSize);
  drawing = created;
  created.renderer.root.add(box);
  unmount = mountPanes(session, created.renderer, box);

  // The rows of the pane area.
  const drawn = async (): Promise<string[]> => {
    await created.renderOnce();

    return created
      .captureCharFrame()
      .split('\n')
      .slice(0, -1)
      .map((line) => line.trimEnd());
  };

  const until = async (condition: (rows: string[]) => boolean): Promise<string[]> => {
    let rows = await drawn();

    for (let attempt = 0; attempt < 200 && !condition(rows); attempt += 1) {
      await Bun.sleep(50);
      rows = await drawn();
    }

    expect(condition(rows)).toBe(true);

    return rows;
  };

  return { session, until, drawn };
};

it(
  'draws the oldest row of a pane scrolled to the top, and the newest at the bottom',
  async () => {
    const { directory, phi, first } = await setup(history);
    const { until } = await attachAndDraw(directory);

    await until((rows) => rows.includes('a5000'));

    const scrolled = await phi('pane', 'scroll', first, '--to', 'top');

    expect(scrolled.exitCode).toBe(0);

    const top = await until((rows) => rows[0] === 'a1');

    expect(top.slice(0, 3)).toEqual(['a1', 'a2', 'a3']);

    const followed = await phi('pane', 'scroll', first, '--to', 'bottom');

    expect(followed.exitCode).toBe(0);
    await until((rows) => rows.includes('a5000'));
  },
  cliTestTimeoutMs,
);

it(
  'draws history rows the same when fetched from the server and when read from the cache',
  async () => {
    const { directory, phi, first } = await setup(history);
    const { session, until } = await attachAndDraw(directory);

    await until((rows) => rows.includes('a5000'));

    const cache = session.rowCache(paneId(Number(first.slice('pane-'.length))));

    expect(cache?.rowAt(2000)).toBeUndefined();

    await phi('pane', 'scroll', first, '--to', '2000');

    const fetched = await until((rows) => rows[0] === 'a2001');

    expect(cache?.rowAt(2000)).toBeDefined();

    await phi('pane', 'scroll', first, '--to', 'bottom');
    await until((rows) => rows.includes('a5000'));

    const heldRows = cache?.heldRowCount();

    await phi('pane', 'scroll', first, '--to', '2000');

    const cached = await until((rows) => rows[0] === 'a2001');

    expect(cached).toEqual(fetched);
    expect(cache?.heldRowCount()).toBe(heldRows);
  },
  cliTestTimeoutMs,
);

it(
  'keeps the drawn rows while output arrives in scrolled history, and follows output at the bottom',
  async () => {
    const { directory, phi, first } = await setup(history);
    const { session, until } = await attachAndDraw(directory);

    await until((rows) => rows.includes('a5000'));

    const cache = session.rowCache(paneId(Number(first.slice('pane-'.length))));
    const before = cache?.bounds()?.activeTop ?? 0;

    await phi('pane', 'scroll', first, '--to', '1000');

    const scrolled = await until((rows) => rows[0] === 'a1001');

    await phi('pane', 'send', 'later\n', '--pane', first);
    await until(() => (cache?.bounds()?.activeTop ?? 0) > before);

    expect(await until(() => true)).toEqual(scrolled);

    await phi('pane', 'scroll', first, '--to', 'bottom');
    await until((rows) => rows.includes('out later'));
  },
  cliTestTimeoutMs,
);
