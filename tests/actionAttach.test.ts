import { expect, it } from 'bun:test';

import { actionCatalog } from '../src/actions.ts';
import { cliTestTimeoutMs } from './cliHarness.ts';
import { setup } from './paneAttachHarness.ts';

type PaneList = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['list']>>;

const pollTimeoutMs = 10_000;

const pollIntervalMs = 50;

const down = '\x1b[B';

const listUntil = async (list: () => Promise<PaneList>, count: number): Promise<PaneList> => {
  const deadline = Date.now() + pollTimeoutMs;
  let panes = await list();

  while (panes.length !== count && Date.now() < deadline) {
    await Bun.sleep(pollIntervalMs);
    panes = await list();
  }

  return panes;
};

const layoutOf = (panes: PaneList) =>
  panes.map(({ id, tab, focused, columns, rows }) => ({ id, tab, focused, columns, rows }));

it(
  'splits the pane from search to the same panes as its key v',
  async () => {
    const byKey = await setup();

    byKey.type('\x02v');

    const keyPanes = await listUntil(byKey.list, 2);

    const bySearch = await setup();

    bySearch.type('\x02/');
    await bySearch.until(() => bySearch.screenText().includes('Next workspace'));
    bySearch.type('split pane right');
    await bySearch.until(() => !bySearch.screenText().includes('Next workspace'));
    bySearch.type('\r');

    const searchPanes = await listUntil(bySearch.list, 2);

    expect(keyPanes).toHaveLength(2);
    expect(layoutOf(searchPanes)).toEqual(layoutOf(keyPanes));
  },
  cliTestTimeoutMs,
);

it(
  'scrolls the shortcut help with Down in a 24-row terminal until Detach client is drawn',
  async () => {
    const { screenText, type, until } = await setup();
    const drawn = (title: string) => screenText().includes(title);

    type('\x02?');
    await until(() => drawn('Next workspace'));

    expect(drawn('Detach client')).toBe(false);

    type(down.repeat(actionCatalog.length));
    await until(() => drawn('Detach client'));

    expect(drawn('Next workspace')).toBe(false);
  },
  cliTestTimeoutMs,
);

it(
  'keeps the selected search result drawn after Down moves past the visible rows',
  async () => {
    const { screenText, type, until } = await setup();
    const last = actionCatalog.at(-1);
    const drawn = (title: string) => screenText().includes(title);

    const lineOf = (title: string) =>
      screenText()
        .split('\n')
        .find((line) => line.includes(title));

    type('\x02/');
    await until(() => drawn('Next workspace'));

    expect(drawn(last?.title ?? '')).toBe(false);
    expect(lineOf('Next workspace')?.startsWith('>')).toBe(true);
    expect(lineOf('Focus next pane')).toContain('(unavailable)');
    expect(lineOf('Split pane right')).not.toContain('(unavailable)');

    type(down.repeat(actionCatalog.length));
    await until(() => drawn(last?.title ?? ''));

    expect(drawn('Next workspace')).toBe(false);
    expect(lineOf(last?.title ?? '')?.startsWith('>')).toBe(true);
  },
  cliTestTimeoutMs,
);
