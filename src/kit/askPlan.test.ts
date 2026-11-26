import { describe, expect, test } from 'bun:test';

import type { AgentInfo, PaneInfo, Program, SpaceInfo, TabInfo } from 'herdr';

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
  name: null,
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
  agents: [],
  focus,
  terminals: [],
});

const agent = (
  spaceId: string,
  name: string,
  status: AgentInfo['status'] = 'working',
  id = name,
): AgentInfo => ({
  address: `a-${id}`,
  pane: `p-${id}`,
  space: spaceId,
  space_name: '',
  tab: 't1',
  tab_index: 1,
  tab_name: '',
  status,
  app: null,
  program: { ...shell, key: name, name, agent: true, shell: false },
  title: name,
  pane_name: null,
  seq: 0,
  pinned: false,
  focused: false,
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

  test('the close space title quotes the name and the body names each agent and the tab count', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [agent('s1', 'Claude Code'), agent('s1', 'Pi')];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close space “api”?',
        body: [
          'Claude Code and Pi stop mid-task, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('a space with no agent running gets a body that names only the tabs', () => {
    const plan = dialogFor('space.close', { id: 's2' }, facts(spaceValues(), [], focusValue));

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close space “web”?',
        body: ['1 tab closes.', 'Its folder, uncommitted changes, and branch stay.'],
      },
    });
  });

  test('the close body counts the agents of one program', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [
      agent('s1', 'Claude Code', 'working', 'claude-1'),
      agent('s1', 'Claude Code', 'working', 'claude-2'),
    ];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          '2 Claude Code agents stop mid-task, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('one terminal shown in two panes counts once', () => {
    const values = facts(spaceValues(), [], focusValue);
    const claude = agent('s1', 'Claude Code', 'working', 'claude');

    values.agents = [claude, { ...claude, pane: 'p-claude-second' }];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          'Claude Code stops mid-task, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('a program split across both clauses keeps its count', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [
      agent('s1', 'Claude Code', 'working', 'claude-working'),
      agent('s1', 'Claude Code', 'done', 'claude-done'),
    ];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          '1 Claude Code agent stops mid-task, 1 Claude Code agent stops, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('a finished agent listed first still follows the mid-task clause', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [agent('s1', 'Pi', 'done'), agent('s1', 'Claude Code')];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          'Claude Code stops mid-task, Pi stops, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('a blocked agent stops mid-task', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [agent('s1', 'Claude Code', 'blocked')];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          'Claude Code stops mid-task, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('three agents join with commas and a final and', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [
      agent('s1', 'Claude Code', 'working', 'claude'),
      agent('s1', 'Pi', 'working', 'pi'),
      agent('s1', 'zsh', 'working', 'zsh'),
    ];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          'Claude Code, Pi, and zsh stop mid-task, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test.each(['done', 'idle'] as const)('a %s agent stops without saying mid-task', (status) => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [agent('s1', 'Claude Code', status)];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          'Claude Code stops, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('a group with a finished agent warns only about the agent that is mid-task', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [agent('s1', 'Claude Code'), agent('s1', 'Pi', 'done')];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          'Claude Code stops mid-task, Pi stops, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('a mixed group keeps the mid-task names together', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [
      agent('s1', 'Claude Code', 'working', 'claude'),
      agent('s1', 'Pi', 'blocked', 'pi'),
      agent('s1', 'zsh', 'idle', 'zsh'),
    ];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: [
          'Claude Code and Pi stop mid-task, zsh stops, and 2 tabs close.',
          'Its folder, uncommitted changes, and branch stay.',
        ],
      },
    });
  });

  test('the close body leaves out an agent that runs in another space', () => {
    const values = facts(spaceValues(), [], focusValue);

    values.agents = [agent('s2', 'Pi')];

    const plan = dialogFor('space.close', { id: 's1' }, values);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: {
        body: ['2 tabs close.', 'Its folder, uncommitted changes, and branch stay.'],
      },
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
        title: 'Close space “web”?',
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

  test('closing a parent asks to close the space when its child is the only other pane', () => {
    const values = facts(
      spaceValues(),
      [terminalPane('parent', 't3'), terminalPane('child', 't3'), terminalPane('elsewhere', 't1')],
      {
        space: 's2',
        tab: 't3',
        pane: 'parent',
      },
    );

    values.terminals = [
      { address: 't-child', parent: 't-parent', live: true, dieWithParent: true },
    ];

    expect(dialogFor('pane.close', {}, values)).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close space “web”?',
        action: 'Close',
        destroys: true,
        command: { name: 'pane.close', args: { pane: 'parent' } },
      },
    });
  });

  test('closing a parent asks to close the space when its child occupies another tab', () => {
    const values = facts([apiSpace()], [terminalPane('parent', 't1'), terminalPane('child', 't2')]);

    values.terminals = [
      { address: 't-child', parent: 't-parent', live: true, dieWithParent: true },
    ];

    expect(dialogFor('pane.close', { pane: 'parent' }, values)).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close space “api”?',
        command: { name: 'pane.close', args: { pane: 'parent' } },
      },
    });
  });

  test('closing a parent counts transitive collateral panes while an independent pane survives', () => {
    const values = facts(
      [webSpace()],
      [
        terminalPane('parent', 't3'),
        terminalPane('child', 't3'),
        terminalPane('grandchild', 't3'),
        modPane('independent', 't3'),
      ],
    );

    values.terminals = [
      { address: 't-grandchild', parent: 'hidden', live: true, dieWithParent: true },
      { address: 'hidden', parent: 't-child', live: true, dieWithParent: true },
      { address: 't-child', parent: 't-parent', live: true, dieWithParent: true },
    ];

    expect(dialogFor('pane.close', { pane: 'parent' }, values)).toEqual({
      kind: 'confirm',
      dialog: {
        title: 'Close pane?',
        body: ['This pane and 2 other panes will close.'],
        action: 'Close',
        destroys: true,
        command: { name: 'pane.close', args: { pane: 'parent' } },
      },
    });
  });

  test('closing a parent counts one collateral pane when another tab survives', () => {
    const values = facts(
      [apiSpace()],
      [
        terminalPane('parent', 't1'),
        terminalPane('child', 't1'),
        terminalPane('independent', 't2'),
      ],
    );

    values.terminals = [
      { address: 't-child', parent: 't-parent', live: true, dieWithParent: true },
    ];

    expect(dialogFor('pane.close', { pane: 'parent' }, values)).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close pane?',
        body: ['This pane and 1 other pane will close.'],
        command: { name: 'pane.close', args: { pane: 'parent' } },
      },
    });
  });

  test('closing a mod pane does not end terminals without parents', () => {
    const values = facts([webSpace()], [modPane('mod', 't3'), terminalPane('child', 't3')]);

    values.terminals = [{ address: 't-child', parent: null, live: true, dieWithParent: true }];

    expect(dialogFor('pane.close', { pane: 'mod' }, values)).toEqual({ kind: 'run' });
  });

  test('closing a parent confirms a bound pane below an unlabelled outliving child', () => {
    const values = facts([webSpace()], [terminalPane('parent', 't3'), terminalPane('child', 't3')]);

    values.terminals = [
      { address: 't-child', parent: 'hidden', live: true, dieWithParent: true, space: 's2' },
      { address: 'hidden', parent: 't-parent', live: true, dieWithParent: false },
    ];

    expect(dialogFor('pane.close', { pane: 'parent' }, values)).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close space “web”?',
        command: { name: 'pane.close', args: { pane: 'parent' } },
      },
    });
  });

  test('closing a parent follows unlabelled app descendants then bound core descendants transitively', () => {
    const values = facts([webSpace()], [terminalPane('parent', 't3'), terminalPane('child', 't3')]);

    values.terminals = [
      { address: 't-child', parent: 'bound', live: true, dieWithParent: true, space: 's2' },
      { address: 'bound', parent: 'empty-label', live: true, dieWithParent: true, space: 's2' },
      { address: 'empty-label', parent: 'hidden', live: true, dieWithParent: false, space: '' },
      { address: 'hidden', parent: 't-parent', live: true, dieWithParent: false },
    ];

    expect(dialogFor('pane.close', { pane: 'parent' }, values)).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close space “web”?',
        command: { name: 'pane.close', args: { pane: 'parent' } },
      },
    });
  });

  test('a core-only death does not restart the app traversal through outliving descendants', () => {
    const values = facts(
      [webSpace()],
      [terminalPane('parent', 't3'), terminalPane('bound', 't3'), terminalPane('survivor', 't3')],
    );

    values.terminals = [
      { address: 't-bound', parent: 't-parent', live: true, dieWithParent: true, space: 's2' },
      { address: 't-survivor', parent: 't-bound', live: true, dieWithParent: false },
    ];

    expect(dialogFor('pane.close', { pane: 'parent' }, values)).toMatchObject({
      kind: 'confirm',
      dialog: {
        title: 'Close pane?',
        body: ['This pane and 1 other pane will close.'],
        command: { name: 'pane.close', args: { pane: 'parent' } },
      },
    });
  });

  test('closing a parent ignores finished and independent descendants and broken parent chains', () => {
    const values = facts([webSpace()], [terminalPane('parent', 't3'), terminalPane('child', 't3')]);

    const child = {
      address: 't-child',
      parent: 't-parent',
      live: true,
      dieWithParent: true,
      space: 's2',
    };

    const chains = [
      [{ ...child, live: false }],
      [{ ...child, dieWithParent: false }],
      [{ ...child, parent: 'missing' }],
      [
        { ...child, parent: 'hidden' },
        { ...child, address: 'hidden', dieWithParent: false },
      ],
      [
        { ...child, parent: 'hidden' },
        { ...child, address: 'hidden', live: false },
      ],
      [{ ...child, parent: 'remote/t-parent' }],
      [{ ...child, parent: 't-child' }],
    ];

    for (const terminals of chains) {
      values.terminals = terminals;
      expect(dialogFor('pane.close', { pane: 'parent' }, values)).toEqual({ kind: 'run' });
    }
  });

  test('closing a child leaves its parent pane without a confirmation', () => {
    const values = facts([webSpace()], [terminalPane('parent', 't3'), terminalPane('child', 't3')]);

    values.terminals = [
      { address: 't-child', parent: 't-parent', live: true, dieWithParent: true },
    ];

    expect(dialogFor('pane.close', { pane: 'child' }, values)).toEqual({ kind: 'run' });
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
