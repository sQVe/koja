import { expect, it } from 'bun:test';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { setup } from './paneHarness.ts';

const legacyRotateRefusalOf = (pane: string): string =>
  `Pane ${pane} is in a legacy split layout tab. Switch the tab first with: koja tab layout <tab-id> master`;

it(
  'refuses pane rotate in a legacy tab with the switch hint and leaves the order and focus unchanged',
  async () => {
    const { koja, list, tabs, act, first, useLegacy } = await setup();

    await useLegacy();
    await act('split', first, '--direction', 'right');

    const beforeTabs = await tabs();
    const beforePanes = await list();

    const failed = await koja('pane', 'rotate', first, '--direction', 'forward');

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain(legacyRotateRefusalOf(first));
    expect(await tabs()).toEqual(beforeTabs);
    expect(await list()).toEqual(beforePanes);
  },
  cliTestTimeoutMs,
);

it(
  'moves focus with pane focus --direction to the neighbor in that direction',
  async () => {
    const { koja, list, act, first, useLegacy } = await setup();

    await useLegacy();
    const second = await act('split', first, '--direction', 'right');
    await act('focus', first);

    const moved = await koja('pane', 'focus', first, '--direction', 'right');

    expect(moved.exitCode).toBe(0);
    expect((await list()).find((pane) => pane.focused)?.id).toBe(second);
  },
  cliTestTimeoutMs,
);

it(
  'refuses pane focus --direction toward the left edge and leaves the focus unchanged',
  async () => {
    const { koja, list, act, first, useLegacy } = await setup();

    await useLegacy();
    await act('split', first, '--direction', 'right');
    await act('focus', first);

    const beforePanes = await list();

    const failed = await koja('pane', 'focus', first, '--direction', 'left');

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain(`Pane ${first} has no pane in that direction.`);
    expect(await list()).toEqual(beforePanes);
  },
  cliTestTimeoutMs,
);
