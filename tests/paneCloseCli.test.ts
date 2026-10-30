import { expect, it } from 'bun:test';

import { z } from 'zod';

import { cliTestTimeoutMs } from './cliHarness.ts';
import { setup } from './paneHarness.ts';
import type { paneListSchema } from './paneHarness.ts';

type Panes = z.infer<typeof paneListSchema>;

const workspaceListSchema = z.array(
  z.object({ id: z.string(), root: z.string(), label: z.string(), focused: z.boolean() }),
);

const idsOf = (panes: Panes): string[] => panes.map((pane) => pane.id).toSorted();

const focusedIdsOf = (panes: Panes): string[] =>
  panes.filter((pane) => pane.focused).map((pane) => pane.id);

const masterWithThreePanes = async () => {
  const session = await setup();
  const second = await session.act('add', session.first);
  const third = await session.act('add', second);
  const [tab] = await session.tabs();

  expect(tab?.arrangement).toEqual({ choice: 'master', order: [session.first, second, third] });

  return { ...session, second, third };
};

it(
  'closing the master pane selects the pane that moves into its place',
  async () => {
    const { act, list, tabs, first, second, third } = await masterWithThreePanes();

    await act('focus', first);

    expect(await act('close', first)).toBe(first);

    const [tab] = await tabs();
    const remaining = await list();

    expect(tab?.arrangement).toEqual({ choice: 'master', order: [second, third] });
    expect(idsOf(remaining)).toEqual([second, third].toSorted());
    expect(focusedIdsOf(remaining)).toEqual([second]);
  },
  cliTestTimeoutMs,
);

it(
  'closing the selected right-side pane selects the pane that moves into its place',
  async () => {
    const { act, list, tabs, first, second, third } = await masterWithThreePanes();

    await act('focus', second);

    expect(await act('close', second)).toBe(second);

    const [tab] = await tabs();
    const remaining = await list();

    expect(tab?.arrangement).toEqual({ choice: 'master', order: [first, third] });
    expect(idsOf(remaining)).toEqual([first, third].toSorted());
    expect(focusedIdsOf(remaining)).toEqual([third]);
  },
  cliTestTimeoutMs,
);

it(
  'closing the selected last pane in master order selects the previous pane',
  async () => {
    const { act, list, tabs, first, second, third } = await masterWithThreePanes();

    await act('focus', third);

    expect(await act('close', third)).toBe(third);

    const [tab] = await tabs();
    const remaining = await list();

    expect(tab?.arrangement).toEqual({ choice: 'master', order: [first, second] });
    expect(idsOf(remaining)).toEqual([first, second].toSorted());
    expect(focusedIdsOf(remaining)).toEqual([second]);
  },
  cliTestTimeoutMs,
);

it(
  'closing an unselected right-side pane keeps the selection on the same pane',
  async () => {
    const { act, list, tabs, first, second, third } = await masterWithThreePanes();

    await act('focus', first);

    expect(await act('close', second)).toBe(second);

    const [tab] = await tabs();
    const remaining = await list();

    expect(tab?.arrangement).toEqual({ choice: 'master', order: [first, third] });
    expect(idsOf(remaining)).toEqual([first, third].toSorted());
    expect(focusedIdsOf(remaining)).toEqual([first]);
  },
  cliTestTimeoutMs,
);

it(
  'closing the only pane in master layout leaves its workspace with zero tabs',
  async () => {
    const { koja, act, list, tabs, first } = await setup();

    const workspacesOf = async () => {
      const listed = await koja('workspace', 'list', '--json');

      expect(listed.exitCode).toBe(0);

      return workspaceListSchema.parse(JSON.parse(listed.stdout));
    };

    const [tab] = await tabs();

    expect(tab?.arrangement).toEqual({ choice: 'master', order: [first] });

    const workspacesBefore = await workspacesOf();

    expect(await act('close', first)).toBe(first);

    expect(await list()).toEqual([]);
    expect(await tabs()).toEqual([]);
    expect(workspacesBefore).toHaveLength(1);
    expect(await workspacesOf()).toEqual(workspacesBefore);
  },
  cliTestTimeoutMs,
);
