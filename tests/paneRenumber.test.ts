import { expect, it } from 'bun:test';

import { spawnPane } from '../src/server/pane.ts';
import { temporaryDirectory, testIdentity, waitFor } from './serverHarness.ts';

it('reports the renumbering of the primary screen once it returns from the alternate screen', async () => {
  const renumbered: { oldActiveTop: number; first: number; newActiveTop: number }[] = [];

  const result = spawnPane({
    generation: 1,
    size: { columns: 80, rows: 24 },
    environment: { ...process.env, SHELL: '/bin/sh' },
    directory: await temporaryDirectory(),
    identity: testIdentity,
    useScope: false,
    onOutput: () => undefined,
    onRenumbered: (fact) => {
      renumbered.push(fact);
    },
    onBell: () => undefined,
    onClipboard: () => undefined,
    onFailed: () => undefined,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const { pane } = result;

  const send = (text: string): void => {
    pane.write(new TextEncoder().encode(text));
  };

  send("seq -f '%070g' 1 100; printf '\\033[?1049h'\n");
  await waitFor(() => pane.terminal.stableRows().alternate);

  pane.resize({ columns: 40, rows: 24 });
  expect(renumbered).toEqual([]);

  send("printf '\\033[?1049l'\n");
  await waitFor(() => renumbered.length > 0);

  expect(renumbered).toHaveLength(1);
  expect(renumbered[0]?.newActiveTop).toBe(pane.terminal.stableRows().activeTop);

  pane[Symbol.dispose]();
});
