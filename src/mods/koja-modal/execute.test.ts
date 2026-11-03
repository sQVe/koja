import { describe, expect, test } from 'bun:test';

import type { NormalAction, NormalIntent } from '../../kit/normalKeys.ts';
import { writeSpaceOrder } from '../../kit/spaceOrder.ts';
import type { Executor, PaneLike } from './execute.ts';
import { createExecutor } from './execute.ts';

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

interface Session {
  values: Record<string, unknown>;
  calls: RunCall[];
  act: (action: NormalAction) => void;
  reopen: () => void;
  setFocus: (pane: string | null, tab?: string | null) => void;
  clearFocus: () => void;
  setSpace: (space: string | null) => void;
  setLiveSpaces: (ids: string[]) => void;
  setPanes: (panes: PaneLike[]) => void;
  publishOrder: (shown: string[], hidden?: string[]) => void;
}

const command = (name: string): NormalAction => ({ kind: 'command', command: name });

const intent = (name: NormalIntent): NormalAction => ({ kind: 'intent', intent: name });

const nthTab = (index: number): NormalAction => ({ kind: 'nthTab', index });

const historyKey = 'koja-modal.history';

const createSession = (initialPanes: PaneLike[], startPane: string, startTab: string): Session => {
  let currentPane: string | null = startPane;
  let currentTab: string | null = startTab;
  let currentSpace: string | null = 'space-1';
  let hasFocus = true;
  let liveSpaces: string[] = [];
  let panes = initialPanes;
  const values: Record<string, unknown> = {};
  const calls: RunCall[] = [];

  const run = (name: string, args?: Record<string, unknown>): void => {
    calls.push({ command: name, args });

    const pane = args?.['pane'];

    if (name === 'pane.focus' && typeof pane === 'string') {
      currentPane = pane;
    }
  };

  const store = {
    get: (key: string): unknown => values[key],
    set: (key: string, value: unknown): void => {
      values[key] = value;
    },
  };

  const makeExecutor = (): Executor =>
    createExecutor({
      run,
      panes: () => panes,
      focused: () =>
        hasFocus ? { pane: currentPane, tab: currentTab, space: currentSpace } : null,
      spaces: () => liveSpaces.map((id) => ({ id })),
      store,
      historyKey,
    });

  let executor = makeExecutor();

  return {
    values,
    calls,
    setFocus: (pane, tab) => {
      currentPane = pane;

      if (tab !== undefined) {
        currentTab = tab;
      }
    },
    clearFocus: () => {
      hasFocus = false;
    },
    setSpace: (space) => {
      currentSpace = space;
    },
    setLiveSpaces: (ids) => {
      liveSpaces = ids;
    },
    setPanes: (next) => {
      panes = next;
    },
    publishOrder: (shown, hidden = []) => {
      writeSpaceOrder(store.set, { shown, hidden });
    },
    act: (action) => {
      if (action.kind !== 'leave') {
        executor.execute(action);
      }
    },
    reopen: () => {
      executor = makeExecutor();
      executor.observe();
    },
  };
};

const twoPanes: PaneLike[] = [
  { pane: 'p1', tab: 'tab-1' },
  { pane: 'p2', tab: 'tab-1' },
];

describe('close other panes', () => {
  test('ctrl-w o closes every other pane in the focused tab only', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p2', tab: 'tab-1' },
      { pane: 'p3', tab: 'tab-2' },
    ];

    const session = createSession(panes, 'p1', 'tab-1');

    session.act(intent('closeOtherPanes'));

    expect(session.calls).toEqual([{ command: 'pane.close', args: { pane: 'p2' } }]);
  });

  test('ctrl-w o does nothing when no pane is focused', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.setFocus(null);

    session.act(intent('closeOtherPanes'));

    expect(session.calls).toEqual([]);
  });
});

describe('pane movement', () => {
  test('ctrl-w w moves to the next pane in the focused tab', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.act(intent('nextPane'));

    expect(session.calls).toEqual([{ command: 'pane.focus', args: { pane: 'p2' } }]);
  });

  test('ctrl-w p returns to the last pane after normal mode is closed and reopened', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.act(intent('nextPane'));

    expect(session.calls).toEqual([{ command: 'pane.focus', args: { pane: 'p2' } }]);

    session.reopen();

    session.act(intent('lastPane'));

    expect(session.calls).toEqual([
      { command: 'pane.focus', args: { pane: 'p2' } },
      { command: 'pane.focus', args: { pane: 'p1' } },
    ]);
  });

  test('ctrl-w p does nothing when the last pane is gone', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.act(intent('nextPane'));
    session.setPanes([{ pane: 'p2', tab: 'tab-1' }]);

    const afterMove = session.calls.length;

    session.act(intent('lastPane'));

    expect(session.calls.slice(afterMove)).toEqual([]);
  });
});

describe('navigation history', () => {
  const tabAndPanePanes: PaneLike[] = [
    { pane: 'p1', tab: 'tab-1' },
    { pane: 'p3', tab: 'tab-2' },
    { pane: 'p4', tab: 'tab-2' },
  ];

  test('g then Tab returns to the earlier tab after a pane move', () => {
    const session = createSession(tabAndPanePanes, 'p1', 'tab-1');

    session.act(command('tab.next'));
    session.setFocus('p3', 'tab-2');

    session.act(intent('nextPane'));

    session.act(intent('lastTab'));

    expect(session.calls).toEqual([
      { command: 'tab.next', args: undefined },
      { command: 'pane.focus', args: { pane: 'p4' } },
      { command: 'tab.select', args: { id: 'tab-1' } },
    ]);
  });

  test('ctrl-w p returns to the last pane after a tab change and back', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p2', tab: 'tab-1' },
      { pane: 'p3', tab: 'tab-2' },
    ];

    const session = createSession(panes, 'p1', 'tab-1');

    session.act(intent('nextPane'));
    session.act(command('tab.next'));
    session.setFocus('p3', 'tab-2');
    session.act(command('tab.prev'));
    session.setFocus('p2', 'tab-1');

    session.act(intent('lastPane'));

    expect(session.calls).toEqual([
      { command: 'pane.focus', args: { pane: 'p2' } },
      { command: 'tab.next', args: undefined },
      { command: 'tab.prev', args: undefined },
      { command: 'pane.focus', args: { pane: 'p1' } },
    ]);
  });

  test('a pane move in a single-pane tab does not erase the last pane', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p2', tab: 'tab-1' },
      { pane: 'p3', tab: 'tab-2' },
    ];

    const session = createSession(panes, 'p1', 'tab-1');

    session.act(intent('nextPane'));
    session.act(command('tab.next'));
    session.setFocus('p3', 'tab-2');
    session.act(intent('nextPane'));
    session.act(command('tab.prev'));
    session.setFocus('p2', 'tab-1');

    session.act(intent('lastPane'));

    expect(session.calls).toEqual([
      { command: 'pane.focus', args: { pane: 'p2' } },
      { command: 'tab.next', args: undefined },
      { command: 'tab.prev', args: undefined },
      { command: 'pane.focus', args: { pane: 'p1' } },
    ]);
  });

  test('a pane action that keeps focus does not erase the last tab', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p3', tab: 'tab-2' },
    ];

    const session = createSession(panes, 'p1', 'tab-1');

    session.act(command('tab.next'));
    session.setFocus('p3', 'tab-2');

    session.act(intent('closeOtherPanes'));

    session.act(intent('lastTab'));

    expect(session.calls).toEqual([
      { command: 'tab.next', args: undefined },
      { command: 'tab.select', args: { id: 'tab-1' } },
    ]);
  });
});

describe('observed history', () => {
  const agentPanes: PaneLike[] = [
    { pane: 'p1', tab: 'tab-1' },
    { pane: 'p2', tab: 'tab-1' },
    { pane: 'p3', tab: 'tab-2' },
    { pane: 'p4', tab: 'tab-2' },
  ];

  test('ctrl-w p returns after a directional move with no destination', () => {
    const session = createSession(agentPanes, 'p1', 'tab-1');

    session.act(intent('nextPane'));
    session.act(command('pane.go:right'));

    session.act(intent('lastPane'));

    expect(session.calls).toEqual([
      { command: 'pane.focus', args: { pane: 'p2' } },
      { command: 'pane.go:right', args: undefined },
      { command: 'pane.focus', args: { pane: 'p1' } },
    ]);
  });

  test('2gt on the current tab 2 keeps g then Tab returning to tab 1', () => {
    const session = createSession(agentPanes, 'p1', 'tab-1');

    session.act(command('tab.next'));
    session.setFocus('p3', 'tab-2');

    session.act(nthTab(2));

    session.act(intent('lastTab'));

    expect(session.calls).toEqual([
      { command: 'tab.next', args: undefined },
      { command: 'tab.select', args: { index: 2 } },
      { command: 'tab.select', args: { id: 'tab-1' } },
    ]);
  });

  test('ctrl-q n between two agents in one tab keeps g then Tab returning to tab 1', () => {
    const session = createSession(agentPanes, 'p1', 'tab-1');

    session.act(command('tab.next'));
    session.setFocus('p3', 'tab-2');

    session.act(command('agent.next'));
    session.setFocus('p4', 'tab-2');

    session.act(intent('lastTab'));

    expect(session.calls).toEqual([
      { command: 'tab.next', args: undefined },
      { command: 'agent.next', args: undefined },
      { command: 'tab.select', args: { id: 'tab-1' } },
    ]);
  });

  test('a no-op space.next keeps both pane and tab history', () => {
    const session = createSession(agentPanes, 'p1', 'tab-1');

    session.act(intent('nextPane'));
    session.act(command('tab.next'));
    session.setFocus('p3', 'tab-2');
    session.act(command('space.next'));

    session.act(intent('lastTab'));
    session.setFocus('p2', 'tab-1');

    session.act(intent('lastPane'));

    expect(session.calls).toEqual([
      { command: 'pane.focus', args: { pane: 'p2' } },
      { command: 'tab.next', args: undefined },
      { command: 'space.next', args: undefined },
      { command: 'tab.select', args: { id: 'tab-1' } },
      { command: 'pane.focus', args: { pane: 'p1' } },
    ]);
  });
});

describe('space navigation', () => {
  // Herdr's list is main, notes, worktree; the sidebar nests the worktree under main.
  const sidebarOrder = ['main', 'worktree', 'notes'];

  const focusedSession = (space: string): Session => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.setSpace(space);
    session.setLiveSpaces(sidebarOrder);

    return session;
  };

  test('Tab falls back to space.next when a live space is in neither published list', () => {
    const session = focusedSession('main');

    session.setLiveSpaces(['main', 'notes', 'added']);
    session.publishOrder(['main', 'notes']);
    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([{ command: 'space.next', args: undefined }]);
  });

  test('Shift-Tab falls back to space.prev when a live space is in neither published list', () => {
    const session = focusedSession('main');

    session.setLiveSpaces(['main', 'notes', 'added']);
    session.publishOrder(['main', 'notes']);
    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([{ command: 'space.prev', args: undefined }]);
  });

  test('Tab skips a folded space listed as hidden, without falling back', () => {
    const session = focusedSession('main');

    session.setLiveSpaces(['main', 'worktree', 'notes']);
    session.publishOrder(['main', 'notes'], ['worktree']);
    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'notes' } }]);
  });

  test('Tab from a hidden space selects the first shown space', () => {
    const session = focusedSession('remote-a');

    session.setLiveSpaces(['local', 'remote-a', 'remote-b']);
    session.publishOrder(['local'], ['remote-a', 'remote-b']);
    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'local' } }]);
  });

  test('Shift-Tab from a hidden space selects the last shown space', () => {
    const session = focusedSession('remote-a');

    session.setLiveSpaces(['local', 'notes', 'remote-a', 'remote-b']);
    session.publishOrder(['local', 'notes'], ['remote-a', 'remote-b']);
    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'notes' } }]);
  });

  test('Tab skips a space that was removed after the order was published', () => {
    const session = focusedSession('main');

    session.setLiveSpaces(['main', 'notes']);
    session.publishOrder(['main', 'removed', 'notes']);
    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'notes' } }]);
  });

  test('Shift-Tab skips a space that was removed after the order was published', () => {
    const session = focusedSession('notes');

    session.setLiveSpaces(['main', 'notes']);
    session.publishOrder(['main', 'removed', 'notes']);
    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'main' } }]);
  });

  test('Tab selects the next row of the sidebar, not the next space in Herdr order', () => {
    const session = focusedSession('main');

    session.publishOrder(sidebarOrder);
    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'worktree' } }]);
  });

  test('Shift-Tab selects the row above in the sidebar', () => {
    const session = focusedSession('worktree');

    session.publishOrder(sidebarOrder);
    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'main' } }]);
  });

  test('Tab wraps from the last row to the first', () => {
    const session = focusedSession('notes');

    session.publishOrder(sidebarOrder);
    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'main' } }]);
  });

  test('Shift-Tab wraps from the first row to the last', () => {
    const session = focusedSession('main');

    session.publishOrder(sidebarOrder);
    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'notes' } }]);
  });

  test('Tab and Shift-Tab run space.next and space.prev when no order is published', () => {
    const session = focusedSession('main');

    session.act(intent('nextSpace'));
    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([
      { command: 'space.next', args: undefined },
      { command: 'space.prev', args: undefined },
    ]);
  });

  test('Tab and Shift-Tab run space.next and space.prev when the focused space is not in the order', () => {
    const session = focusedSession('hidden');

    session.publishOrder(sidebarOrder);
    session.act(intent('nextSpace'));
    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([
      { command: 'space.next', args: undefined },
      { command: 'space.prev', args: undefined },
    ]);
  });
});

describe('tabs and overlays', () => {
  test('3gt selects the third tab', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.act(nthTab(3));

    expect(session.calls).toEqual([{ command: 'tab.select', args: { index: 3 } }]);
  });

  test('g then Tab returns to the last tab after normal mode is reopened', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.act(command('tab.next'));
    session.setFocus('p1', 'tab-2');

    session.reopen();

    session.act(intent('lastTab'));

    expect(session.calls).toEqual([
      { command: 'tab.next', args: undefined },
      { command: 'tab.select', args: { id: 'tab-1' } },
    ]);
  });

  test('Backspace opens the palette and Space Space opens the picker', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.act(command('mod.open:koja-palette'));
    session.act(command('mod.open:koja-picker'));

    expect(session.calls).toEqual([
      { command: 'mod.open:koja-palette', args: undefined },
      { command: 'mod.open:koja-picker', args: undefined },
    ]);
  });
});

describe('no focused pane', () => {
  test('does nothing for pane and tab intents', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.clearFocus();
    session.act(intent('closeOtherPanes'));
    session.act(intent('nextPane'));
    session.act(intent('previousPane'));
    session.act(intent('lastPane'));
    session.act(intent('lastTab'));

    expect(session.calls).toEqual([]);
  });

  test('falls back for space intents', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.clearFocus();
    session.act(intent('nextSpace'));
    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([
      { command: 'space.next', args: undefined },
      { command: 'space.prev', args: undefined },
    ]);
  });

  test('does nothing for the last pane and tab when no pane is focused', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.values[historyKey] = {
      current: { pane: 'p1', tab: 'tab-1', space: 'space-1' },
      lastPane: 'p2',
      lastTab: 'tab-2',
    };

    session.clearFocus();
    session.act(intent('lastPane'));
    session.act(intent('lastTab'));

    expect(session.calls).toEqual([]);
  });
});

describe('pane move edges', () => {
  test('moves forward from the middle of the tab', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p2', tab: 'tab-1' },
      { pane: 'p3', tab: 'tab-1' },
    ];

    const session = createSession(panes, 'p2', 'tab-1');

    session.act(intent('nextPane'));

    expect(session.calls).toEqual([{ command: 'pane.focus', args: { pane: 'p3' } }]);
  });

  test('does nothing when the focused pane is not in the list', () => {
    const session = createSession(twoPanes, 'gone', 'tab-1');

    session.act(intent('nextPane'));

    expect(session.calls).toEqual([]);
  });

  test('moves backward from the middle of the tab', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p2', tab: 'tab-1' },
      { pane: 'p3', tab: 'tab-1' },
    ];

    const session = createSession(panes, 'p2', 'tab-1');

    session.act(intent('previousPane'));

    expect(session.calls).toEqual([{ command: 'pane.focus', args: { pane: 'p1' } }]);
  });
});

describe('last pane guards', () => {
  test('does nothing when the recorded last pane is the focused pane', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.values[historyKey] = {
      current: { pane: 'p1', tab: 'tab-1', space: 'space-1' },
      lastPane: 'p1',
      lastTab: null,
    };

    session.act(intent('lastPane'));

    expect(session.calls).toEqual([]);
  });

  test('does not focus the last pane when it left the focused tab', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p2', tab: 'tab-2' },
    ];

    const session = createSession(panes, 'p1', 'tab-1');

    session.values[historyKey] = {
      current: { pane: 'p1', tab: 'tab-1', space: 'space-1' },
      lastPane: 'p2',
      lastTab: null,
    };

    session.act(intent('lastPane'));

    expect(session.calls).toEqual([]);
  });

  test('keeps the recorded last tab when the stored focus is not an object', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p3', tab: 'tab-2' },
    ];

    const session = createSession(panes, 'p1', 'tab-1');

    session.values[historyKey] = { current: 'garbage', lastPane: null, lastTab: 'tab-2' };
    session.act(intent('lastTab'));

    expect(session.calls).toEqual([{ command: 'tab.select', args: { id: 'tab-2' } }]);
  });

  test('keeps the recorded last tab when the stored focus is null', () => {
    const panes: PaneLike[] = [
      { pane: 'p1', tab: 'tab-1' },
      { pane: 'p3', tab: 'tab-2' },
    ];

    const session = createSession(panes, 'p1', 'tab-1');

    session.values[historyKey] = { current: null, lastPane: null, lastTab: 'tab-2' };
    session.act(intent('lastTab'));

    expect(session.calls).toEqual([{ command: 'tab.select', args: { id: 'tab-2' } }]);
  });
});

describe('last tab guards', () => {
  test('does nothing when the recorded last tab is the focused tab', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.values[historyKey] = {
      current: { pane: 'p1', tab: 'tab-1', space: 'space-1' },
      lastPane: null,
      lastTab: 'tab-1',
    };

    session.act(intent('lastTab'));

    expect(session.calls).toEqual([]);
  });

  test('does not select the last tab after it closed', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.values[historyKey] = {
      current: { pane: 'p1', tab: 'tab-1', space: 'space-1' },
      lastPane: null,
      lastTab: 'tab-2',
    };

    session.act(intent('lastTab'));

    expect(session.calls).toEqual([]);
  });
});

describe('space hidden edges', () => {
  const hiddenSession = (space: string): Session => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.setSpace(space);
    session.setLiveSpaces(['local', 'notes', 'extra', 'remote']);
    session.publishOrder(['local', 'notes', 'extra'], ['remote']);

    return session;
  };

  test('Tab from a hidden space selects the first shown space', () => {
    const session = hiddenSession('remote');

    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'local' } }]);
  });

  test('Shift-Tab from a hidden space selects the last shown space', () => {
    const session = hiddenSession('remote');

    session.act(intent('previousSpace'));

    expect(session.calls).toEqual([{ command: 'space.select', args: { id: 'extra' } }]);
  });

  test('falls back when no space is focused', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.setSpace(null);
    session.setLiveSpaces(['main']);
    session.publishOrder(['main']);
    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([{ command: 'space.next', args: undefined }]);
  });

  test('does not select a single space again', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.setSpace('main');
    session.setLiveSpaces(['main']);
    session.publishOrder(['main']);
    session.act(intent('nextSpace'));

    expect(session.calls).toEqual([]);
  });
});
