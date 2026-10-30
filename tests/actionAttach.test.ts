import { expect, it } from 'bun:test';

import { z } from 'zod';

import { actionCatalog } from '../src/actions.ts';
import { cliTestTimeoutMs } from './cliHarness.ts';
import { setup } from './paneAttachHarness.ts';

type PaneList = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['list']>>;

type AttachSetup = Awaited<ReturnType<typeof setup>>;

interface LayoutSnapshot {
  order: string[];
  focused: string | undefined;
}

const pollTimeoutMs = 10_000;

const pollIntervalMs = 50;

const down = '\x1b[B';

const tabChoicesSchema = z.array(z.object({ arrangement: z.object({ choice: z.string() }) }));

const processInfoSchema = z.object({ shell_pid: z.number() });

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

    await byKey.useLegacy();

    byKey.type('\x02v');

    const keyPanes = await listUntil(byKey.list, 2);

    const bySearch = await setup();

    await bySearch.useLegacy();

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

it(
  'switches the shown tab to legacy and back from search and keeps panes, processes, selection, and mode',
  async () => {
    const { koja, list, act, lines, screenText, type, until, first } = await setup();

    await act('add', first);
    await act('focus', first);

    const choices = async () =>
      tabChoicesSchema
        .parse(JSON.parse(await koja('tab', 'list', '--json')))
        .map((tab) => tab.arrangement.choice);

    const pids = async (panes: PaneList) =>
      Promise.all(
        panes.map(
          async (pane) =>
            processInfoSchema.parse(
              JSON.parse(await koja('pane', 'process-info', pane.id, '--json')),
            ).shell_pid,
        ),
      );

    const shown = async () => {
      const panes = await list();

      return {
        ids: panes.map((pane) => pane.id),
        focused: panes.find((pane) => pane.focused)?.id,
        pids: await pids(panes),
      };
    };

    const isNormal = () => lines().at(-1)?.trim().startsWith('NORMAL') === true;

    const runFromSearch = async (query: string, choice: string): Promise<void> => {
      type('/');
      await until(() => screenText().includes('Next workspace'));
      type(query);
      await until(() => !screenText().includes('Next workspace'));
      type('\r');

      for (let attempt = 0; attempt < 100 && (await choices())[0] !== choice; attempt += 1) {
        await Bun.sleep(pollIntervalMs);
      }
    };

    type('\x02');
    await until(isNormal);

    const before = await shown();

    expect(await choices()).toEqual(['master']);
    expect(before.focused).toBe(first);

    await runFromSearch('legacy split layout', 'legacy');

    expect(await choices()).toEqual(['legacy']);
    expect(await shown()).toEqual(before);
    expect(isNormal()).toBe(true);

    await runFromSearch('master layout', 'master');

    expect(await choices()).toEqual(['master']);
    expect(await shown()).toEqual(before);
    expect(isNormal()).toBe(true);
  },
  cliTestTimeoutMs,
);

const tabOrderSchema = z.array(z.object({ arrangement: z.object({ order: z.array(z.string()) }) }));

const snapshotLayout = async (harness: AttachSetup): Promise<LayoutSnapshot> => {
  const [tab] = tabOrderSchema.parse(JSON.parse(await harness.koja('tab', 'list', '--json')));
  const panes = await harness.list();

  return { order: tab?.arrangement.order ?? [], focused: panes.find((pane) => pane.focused)?.id };
};

const isNormalOf = (harness: AttachSetup): boolean =>
  harness.lines().at(-1)?.trim().startsWith('NORMAL') === true;

const runFromSearch = async (harness: AttachSetup, query: string): Promise<void> => {
  harness.type('/');
  await harness.until(() => harness.screenText().includes('Next workspace'));
  harness.type(query);
  await harness.until(() => !harness.screenText().includes('Next workspace'));
  harness.type('\r');
};

const waitForLayout = async (
  harness: AttachSetup,
  expected: LayoutSnapshot,
): Promise<LayoutSnapshot> => {
  let layout = await snapshotLayout(harness);

  for (
    let attempt = 0;
    attempt < 100 && JSON.stringify(layout) !== JSON.stringify(expected);
    attempt += 1
  ) {
    await Bun.sleep(pollIntervalMs);
    layout = await snapshotLayout(harness);
  }

  return layout;
};

const addMasterPanes = async (harness: AttachSetup): Promise<[string, string, string]> => {
  const second = await harness.act('add', harness.first);
  const third = await harness.act('add', second);

  return [harness.first, second, third];
};

it(
  'rotates and focuses right to the same layout from action search and from koja action run',
  async () => {
    const search = await setup();
    const [first, second, third] = await addMasterPanes(search);

    search.type('\x02');
    await search.until(() => isNormalOf(search));

    await runFromSearch(search, 'Rotate panes forward');

    const searchRotated = await waitForLayout(search, {
      order: [second, third, first],
      focused: second,
    });

    await runFromSearch(search, 'Focus pane right');

    const searchFocused = await waitForLayout(search, {
      order: searchRotated.order,
      focused: third,
    });

    const cli = await setup();
    const [cliFirst, cliSecond, cliThird] = await addMasterPanes(cli);

    await cli.koja('action', 'run', 'pane.rotateForward');

    const cliRotated = await waitForLayout(cli, {
      order: [cliSecond, cliThird, cliFirst],
      focused: cliSecond,
    });

    await cli.koja('action', 'run', 'pane.focusRight');
    const cliFocused = await waitForLayout(cli, { order: cliRotated.order, focused: cliThird });

    expect([searchRotated, searchFocused]).toEqual([cliRotated, cliFocused]);
  },
  cliTestTimeoutMs,
);

it(
  'keeps the status bar in NORMAL after rotating twice from action search and keeps typed text off the pane',
  async () => {
    const harness = await setup();
    const [first, second, third] = await addMasterPanes(harness);

    harness.type('\x02');
    await harness.until(() => isNormalOf(harness));

    await runFromSearch(harness, 'Rotate panes forward');
    await waitForLayout(harness, { order: [second, third, first], focused: second });

    await runFromSearch(harness, 'Rotate panes forward');
    await waitForLayout(harness, { order: [third, first, second], focused: third });

    expect(isNormalOf(harness)).toBe(true);

    harness.type('qq');
    await Bun.sleep(pollIntervalMs * 10);

    expect(harness.screenText()).not.toContain('qq');
    expect(isNormalOf(harness)).toBe(true);
  },
  cliTestTimeoutMs,
);
