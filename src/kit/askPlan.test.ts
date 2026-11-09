import { describe, expect, test } from 'bun:test';

import type { PaneInfo, Program, SpaceInfo, TabInfo } from 'herdr';

import type { AskFacts } from './askPlan.ts';
import { dialogFor } from './askPlan.ts';

const shell: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

const tab = (id: string, name: string, named = true): TabInfo => ({
  id,
  index: 1,
  name,
  named,
  active: false,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

const space = (id: string, name: string, tabs: TabInfo[]): SpaceInfo => ({
  id,
  index: 1,
  name,
  named: true,
  folder: '/tmp',
  machine: null,
  branch: null,
  active: false,
  status: null,
  tabs,
});

const terminalPane = (pane: string, tabId: string): PaneInfo => ({
  pane,
  terminal: `t-${pane}`,
  tab: tabId,
  title: 'shell',
  cwd: null,
  branch: null,
  status: null,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

// Herdr leaves the terminal-only fields out of a mod pane, but its declaration still lists them.
const modPane = (pane: string, tabId: string): PaneInfo =>
  ({
    pane,
    terminal: null,
    mod: 'koja-gallery',
    tab: tabId,
    title: 'Gallery',
  }) as unknown as PaneInfo;

const facts = (
  spaces: SpaceInfo[],
  panes: PaneInfo[] = [],
  focus: AskFacts['focus'] = null,
): AskFacts => ({
  spaces,
  panes,
  focus,
});

const apiSpace = (): SpaceInfo => space('s1', 'api', [tab('t1', 'logs'), tab('t2', 'server')]);

const webSpace = (): SpaceInfo => space('s2', 'web', [tab('t3', 'build')]);

const spaceValues = (): SpaceInfo[] => [apiSpace(), webSpace()];

const focusValue = { space: 's1', tab: 't2', pane: null };

describe('dialogFor', () => {
  test('asks before closing the focused space, and the confirm runs it with confirmed', () => {
    const plan = dialogFor('space.close', {}, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        action: 'Close',
        destroys: true,
        command: { name: 'space.close', args: { id: 's1', confirmed: true } },
      },
    });
  });

  test('closing a space that is already confirmed runs as is', () => {
    const plan = dialogFor(
      'space.close',
      { id: 's2', confirmed: true },
      facts(spaceValues(), [], focusValue),
    );

    expect(plan).toEqual({ kind: 'run' });
  });

  test('closing a space by id asks for that space, not the focused one', () => {
    const plan = dialogFor('space.close', { id: 's2' }, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: { command: { name: 'space.close', args: { id: 's2', confirmed: true } } },
    });
  });

  test('the close space detail counts a mod-only tab as zero terminals', () => {
    const plan = dialogFor(
      'space.close',
      { id: 's2' },
      facts([webSpace()], [modPane('m1', 't3')], focusValue),
    );

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: { detail: 'web — 1 tabs, 0 terminals' },
    });
  });

  test('the close space detail counts only panes with a terminal', () => {
    const panes = [terminalPane('p1', 't3'), modPane('m1', 't3'), terminalPane('p2', 't3')];
    const plan = dialogFor('space.close', { id: 's2' }, facts([webSpace()], panes, focusValue));

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: { detail: 'web — 1 tabs, 2 terminals' },
    });
  });

  test('renaming a space opens a prompt with the current name', () => {
    const plan = dialogFor('space.rename', { id: 's2' }, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({
      kind: 'prompt',
      dialog: { value: 'web', command: { name: 'space.rename', args: { id: 's2' } } },
    });
  });

  test('the space rename prompt says an empty name is named after its folder', () => {
    const plan = dialogFor('space.rename', { id: 's2' }, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({
      kind: 'prompt',
      dialog: { hint: 'empty: named after its folder' },
    });
  });

  test('renaming the focused tab opens a prompt with its current name', () => {
    const plan = dialogFor('tab.rename', {}, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({
      kind: 'prompt',
      dialog: { value: 'server', command: { name: 'tab.rename', args: { id: 't2' } } },
    });
  });

  test('the tab rename prompt says an empty name uses its number', () => {
    const plan = dialogFor('tab.rename', {}, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({ kind: 'prompt', dialog: { hint: 'empty: its number' } });
  });

  test('renaming a tab by id finds it in any space', () => {
    const plan = dialogFor('tab.rename', { id: 't3' }, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({
      kind: 'prompt',
      dialog: { value: 'build', command: { name: 'tab.rename', args: { id: 't3' } } },
    });
  });

  test('renaming the focused tab in a later space uses that space', () => {
    const laterFocus = { space: 's2', tab: 't3', pane: null };
    const plan = dialogFor('tab.rename', {}, facts(spaceValues(), [], laterFocus));

    expect(plan).toMatchObject({
      kind: 'prompt',
      dialog: { value: 'build', command: { name: 'tab.rename', args: { id: 't3' } } },
    });
  });

  test('renaming an unnamed tab opens an empty prompt', () => {
    const unnamed = space('s1', 'api', [tab('t2', '2', false)]);
    const plan = dialogFor('tab.rename', { id: 't2' }, facts([unnamed], [], focusValue));

    expect(plan).toMatchObject({ kind: 'prompt', dialog: { value: '' } });
  });

  test('a rename that already has a name runs as is', () => {
    const plan = dialogFor(
      'tab.rename',
      { id: 't2', name: 'api' },
      facts(spaceValues(), [], focusValue),
    );

    expect(plan).toEqual({ kind: 'run' });
  });

  test('a tab rename to an empty name runs as is, to reset automatic naming', () => {
    const plan = dialogFor(
      'tab.rename',
      { id: 't2', name: '' },
      facts(spaceValues(), [], focusValue),
    );

    expect(plan).toEqual({ kind: 'run' });
  });

  test('a stale id opens nothing and runs nothing', () => {
    const renamePlan = dialogFor(
      'tab.rename',
      { id: 'gone' },
      facts(spaceValues(), [], focusValue),
    );

    const closePlan = dialogFor(
      'space.close',
      { id: 'gone' },
      facts(spaceValues(), [], focusValue),
    );

    expect(renamePlan).toEqual({ kind: 'skip' });
    expect(closePlan).toEqual({ kind: 'skip' });
  });

  test('without a focused space, a rename with no id opens nothing and runs nothing', () => {
    const plan = dialogFor('space.rename', {}, facts(spaceValues()));

    expect(plan).toEqual({ kind: 'skip' });
  });

  test('without a focused tab, a tab rename and close with no id open nothing and run nothing', () => {
    const spaces = spaceValues();

    const renamePlan = dialogFor('tab.rename', {}, facts(spaces));

    const closePlan = dialogFor('tab.close', {}, facts(spaces));

    expect(renamePlan).toEqual({ kind: 'skip' });
    expect(closePlan).toEqual({ kind: 'skip' });
  });

  test('closing the last tab of a space asks first, and the confirm runs it with confirmed', () => {
    const plan = dialogFor('tab.close', { id: 't3' }, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        action: 'Close',
        destroys: true,
        command: { name: 'tab.close', args: { id: 't3', confirmed: true } },
      },
    });
  });

  test('closing a tab that has siblings runs as is', () => {
    const plan = dialogFor('tab.close', { id: 't1' }, facts(spaceValues(), [], focusValue));

    expect(plan).toEqual({ kind: 'run' });
  });

  test('closing the focused tab with no id asks only when it is the last tab', () => {
    const onlyTabFocus = { space: 's2', tab: 't3', pane: null };
    const spaces = spaceValues();

    expect(dialogFor('tab.close', {}, facts(spaces, [], onlyTabFocus)).kind).toBe('confirm');
    expect(dialogFor('tab.close', {}, facts(spaces, [], focusValue))).toEqual({ kind: 'run' });
  });

  test('closing a last tab that is already confirmed runs as is', () => {
    const plan = dialogFor(
      'tab.close',
      { id: 't3', confirmed: true },
      facts(spaceValues(), [], focusValue),
    );

    expect(plan).toEqual({ kind: 'run' });
  });

  test('closing a stale tab id skips', () => {
    const plan = dialogFor('tab.close', { id: 'gone' }, facts(spaceValues(), [], focusValue));

    expect(plan).toEqual({ kind: 'skip' });
  });

  test('closing with no id skips when the focused tab is not in the focused space', () => {
    const plan = dialogFor(
      'tab.close',
      {},
      facts(spaceValues(), [], { space: 's1', tab: 't3', pane: null }),
    );

    expect(plan).toEqual({ kind: 'skip' });
  });

  test('closing the only pane of the only tab asks to close the space, and the confirm closes it', () => {
    const panes = [terminalPane('p1', 't1'), terminalPane('p2', 't3')];
    const plan = dialogFor('pane.close', { pane: 'p2' }, facts(spaceValues(), panes, focusValue));

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close space?',
        action: 'Close',
        destroys: true,
        command: { name: 'tab.close', args: { id: 't3', confirmed: true } },
      },
    });
  });

  test('closing the focused pane with no id asks only when it is the last pane of the space', () => {
    const panes = [terminalPane('p1', 't1'), terminalPane('p2', 't3')];
    const spaces = spaceValues();

    const lonePlan = dialogFor(
      'pane.close',
      {},
      facts(spaces, panes, { space: 's2', tab: 't3', pane: 'p2' }),
    );

    const siblingTabPlan = dialogFor(
      'pane.close',
      {},
      facts(spaces, panes, { space: 's1', tab: 't1', pane: 'p1' }),
    );

    expect(lonePlan.kind).toBe('confirm');
    expect(siblingTabPlan).toEqual({ kind: 'run' });
  });

  test('closing a pane that has a sibling pane runs as is', () => {
    const panes = [terminalPane('p2', 't3'), terminalPane('p3', 't3')];
    const plan = dialogFor('pane.close', { pane: 'p2' }, facts(spaceValues(), panes, focusValue));

    expect(plan).toEqual({ kind: 'run' });
  });

  test('closing a pane that is not known, with no focus, runs as is', () => {
    const panes = [terminalPane('p2', 't3')];

    expect(dialogFor('pane.close', {}, facts(spaceValues(), panes))).toEqual({ kind: 'run' });

    expect(dialogFor('pane.close', { pane: 'gone' }, facts(spaceValues(), panes))).toEqual({
      kind: 'run',
    });
  });

  test('an unrelated command runs as is', () => {
    const plan = dialogFor(
      'pane.split',
      { direction: 'right' },
      facts(spaceValues(), [], focusValue),
    );

    expect(plan).toEqual({ kind: 'run' });
  });
});
