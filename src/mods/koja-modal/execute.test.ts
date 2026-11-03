import { describe, expect, test } from 'bun:test';

import type { Executor, PaneLike } from './execute.ts';
import { createExecutor } from './execute.ts';
import type { KeyModifiers, NormalKeyEvent } from './keyEvent.ts';
import { normalizeKey } from './keyEvent.ts';
import { initialParserState, parseKey } from './parser.ts';

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

interface Session {
  values: Record<string, unknown>;
  calls: RunCall[];
  press: (event: NormalKeyEvent) => void;
  reopen: () => void;
  setFocus: (pane: string | null, tab?: string) => void;
  setPanes: (panes: PaneLike[]) => void;
}

const noModifiers: KeyModifiers = {
  shift: false,
  control: false,
  alt: false,
  platform: false,
  function: false,
};

const control = (key: string, keystroke: string): NormalKeyEvent => ({
  key,
  keystroke,
  key_char: key,
  modifiers: { ...noModifiers, control: true },
});

const plain = (key: string): NormalKeyEvent => ({
  key,
  keystroke: key,
  key_char: key,
  modifiers: noModifiers,
});

const named = (key: string, keystroke: string): NormalKeyEvent => ({
  key,
  keystroke,
  modifiers: noModifiers,
});

const historyKey = 'koja-modal.history';

const createSession = (initialPanes: PaneLike[], startPane: string, startTab: string): Session => {
  let currentPane: string | null = startPane;
  let currentTab = startTab;
  let panes = initialPanes;
  let state = initialParserState;
  const values: Record<string, unknown> = {};
  const calls: RunCall[] = [];

  const run = (command: string, args?: Record<string, unknown>): void => {
    calls.push({ command, args });

    const pane = args?.['pane'];

    if (command === 'pane.focus' && typeof pane === 'string') {
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
      focused: () => ({ pane: currentPane, tab: currentTab }),
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
    setPanes: (next) => {
      panes = next;
    },
    press: (event) => {
      const result = parseKey(state, normalizeKey(event));

      state = result.state;

      if (result.status !== 'action') {
        return;
      }

      if (result.action.kind !== 'leave') {
        executor.execute(result.action, result.count);
      }
    },
    reopen: () => {
      state = initialParserState;
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

    session.press(control('w', 'ctrl-w'));
    session.press(plain('o'));

    expect(session.calls).toEqual([{ command: 'pane.close', args: { pane: 'p2' } }]);
  });

  test('ctrl-w o does nothing when no pane is focused', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.setFocus(null);

    session.press(control('w', 'ctrl-w'));
    session.press(plain('o'));

    expect(session.calls).toEqual([]);
  });
});

describe('pane movement', () => {
  test('ctrl-w w moves to the next pane in the focused tab', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));

    expect(session.calls).toEqual([{ command: 'pane.focus', args: { pane: 'p2' } }]);
  });

  test('ctrl-w p returns to the last pane after normal mode is closed and reopened', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));

    expect(session.calls).toEqual([{ command: 'pane.focus', args: { pane: 'p2' } }]);

    session.reopen();

    session.press(control('w', 'ctrl-w'));
    session.press(plain('p'));

    expect(session.calls).toEqual([
      { command: 'pane.focus', args: { pane: 'p2' } },
      { command: 'pane.focus', args: { pane: 'p1' } },
    ]);
  });

  test('ctrl-w p does nothing when the last pane is gone', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));
    session.setPanes([{ pane: 'p2', tab: 'tab-1' }]);

    const afterMove = session.calls.length;

    session.press(control('w', 'ctrl-w'));
    session.press(plain('p'));

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

    session.press(control('t', 'ctrl-t'));
    session.press(plain('n'));
    session.setFocus('p3', 'tab-2');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));

    session.press(plain('g'));
    session.press(named('tab', 'tab'));

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

    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));
    session.press(control('t', 'ctrl-t'));
    session.press(plain('n'));
    session.setFocus('p3', 'tab-2');
    session.press(control('t', 'ctrl-t'));
    session.press(plain('p'));
    session.setFocus('p2', 'tab-1');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('p'));

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

    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));
    session.press(control('t', 'ctrl-t'));
    session.press(plain('n'));
    session.setFocus('p3', 'tab-2');
    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));
    session.press(control('t', 'ctrl-t'));
    session.press(plain('p'));
    session.setFocus('p2', 'tab-1');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('p'));

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

    session.press(control('t', 'ctrl-t'));
    session.press(plain('n'));
    session.setFocus('p3', 'tab-2');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('o'));

    session.press(plain('g'));
    session.press(named('tab', 'tab'));

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

    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));
    session.press(control('l', 'ctrl-l'));

    session.press(control('w', 'ctrl-w'));
    session.press(plain('p'));

    expect(session.calls).toEqual([
      { command: 'pane.focus', args: { pane: 'p2' } },
      { command: 'pane.go:right', args: undefined },
      { command: 'pane.focus', args: { pane: 'p1' } },
    ]);
  });

  test('2gt on the current tab 2 keeps g then Tab returning to tab 1', () => {
    const session = createSession(agentPanes, 'p1', 'tab-1');

    session.press(control('t', 'ctrl-t'));
    session.press(plain('n'));
    session.setFocus('p3', 'tab-2');

    session.press(plain('2'));
    session.press(plain('g'));
    session.press(plain('t'));

    session.press(plain('g'));
    session.press(named('tab', 'tab'));

    expect(session.calls).toEqual([
      { command: 'tab.next', args: undefined },
      { command: 'tab.select', args: { index: 2 } },
      { command: 'tab.select', args: { id: 'tab-1' } },
    ]);
  });

  test('ctrl-q n between two agents in one tab keeps g then Tab returning to tab 1', () => {
    const session = createSession(agentPanes, 'p1', 'tab-1');

    session.press(control('t', 'ctrl-t'));
    session.press(plain('n'));
    session.setFocus('p3', 'tab-2');

    session.press(control('q', 'ctrl-q'));
    session.press(plain('n'));
    session.setFocus('p4', 'tab-2');

    session.press(plain('g'));
    session.press(named('tab', 'tab'));

    expect(session.calls).toEqual([
      { command: 'tab.next', args: undefined },
      { command: 'agent.next', args: undefined },
      { command: 'tab.select', args: { id: 'tab-1' } },
    ]);
  });

  test('a no-op space.next keeps both pane and tab history', () => {
    const session = createSession(agentPanes, 'p1', 'tab-1');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('w'));
    session.press(control('t', 'ctrl-t'));
    session.press(plain('n'));
    session.setFocus('p3', 'tab-2');
    session.press(named('tab', 'tab'));

    session.press(plain('g'));
    session.press(named('tab', 'tab'));
    session.setFocus('p2', 'tab-1');

    session.press(control('w', 'ctrl-w'));
    session.press(plain('p'));

    expect(session.calls).toEqual([
      { command: 'pane.focus', args: { pane: 'p2' } },
      { command: 'tab.next', args: undefined },
      { command: 'space.next', args: undefined },
      { command: 'tab.select', args: { id: 'tab-1' } },
      { command: 'pane.focus', args: { pane: 'p1' } },
    ]);
  });
});

describe('tabs and overlays', () => {
  test('3gt selects the third tab', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.press(plain('3'));
    session.press(plain('g'));
    session.press(plain('t'));

    expect(session.calls).toEqual([{ command: 'tab.select', args: { index: 3 } }]);
  });

  test('g then Tab returns to the last tab after normal mode is reopened', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.press(control('t', 'ctrl-t'));
    session.press(plain('n'));
    session.setFocus('p1', 'tab-2');

    session.reopen();

    session.press(plain('g'));
    session.press(named('tab', 'tab'));

    expect(session.calls).toEqual([
      { command: 'tab.next', args: undefined },
      { command: 'tab.select', args: { id: 'tab-1' } },
    ]);
  });

  test('Backspace opens the palette and Space Space opens the picker', () => {
    const session = createSession(twoPanes, 'p1', 'tab-1');

    session.press(named('backspace', 'backspace'));
    session.press(named('space', 'space'));
    session.press(named('space', 'space'));

    expect(session.calls).toEqual([
      { command: 'mod.open:koja-palette', args: undefined },
      { command: 'mod.open:koja-picker', args: undefined },
    ]);
  });
});
