import { expect, it } from 'bun:test';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { setup } from './paneAttachHarness.ts';

const prefix = '\x02';

const printHistory = "seq 1 5000 | sed 's/^/a/'\n";

it(
  'scrolls a pane to its first row with g and back to the end with G',
  async () => {
    const { koja, lines, until, type, first } = await setup();
    const shown = () => lines().map((line) => line.trimEnd());
    const statusBar = () => shown().at(-1);

    await koja('pane', 'send', printHistory, '--pane', first);
    await until(() => shown().includes('a5000'));

    type(`${prefix}[g`);
    await until(() => shown().includes('a1'));

    expect(statusBar()).toBe('SCROLL [1]');
    expect(shown()).not.toContain('a5000');

    type('G');
    await until(() => shown().includes('a5000'));

    expect(shown()).not.toContain('a1');
    expect(statusBar()).toBe('SCROLL [1]');
  },
  cliTestTimeoutMs,
);

it(
  'moves a page down with ctrl+f, then leaves scroll mode with q and follows output again',
  async () => {
    const { koja, lines, until, type, first } = await setup();
    const shown = () => lines().map((line) => line.trimEnd());

    await koja('pane', 'send', printHistory, '--pane', first);
    await until(() => shown().includes('a5000'));

    type(`${prefix}[g`);
    await until(() => shown().includes('a1'));
    type('\x06');
    await until(() => !shown().includes('a1'));
    type('q');
    await until(() => shown().at(-1) === 'INSERT [1]');
    await until(() => shown().includes('a5000'));
  },
  cliTestTimeoutMs,
);
