import { describe, expect, test } from 'bun:test';

import type { NormalAction } from '../../kit/normalKeys.ts';
import type { Section } from '../../kit/section.ts';
import { readSection, writeSection } from '../../kit/section.ts';
import type { ParserState } from './parser.ts';
import { initialParserState, parseKey } from './parser.ts';
import { createSections, isSectionKeyAction } from './sections.ts';

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

const createSession = () => {
  const values: Record<string, unknown> = {};
  const writes: unknown[] = [];
  const runCalls: RunCall[] = [];
  const otherActions: NormalAction[] = [];
  const shown = new Set<Section>(['sidebar', 'panes']);
  let state: ParserState = initialParserState;

  const store = {
    get: (key: string): unknown => values[key],
    set: (key: string, value: unknown): void => {
      values[key] = value;
      writes.push(value);
    },
  };

  const sections = createSections({
    store,
    run: (command, args) => {
      runCalls.push({ command, args });
    },
    shown: () => shown,
  });

  const press = (...keys: string[]): void => {
    for (const key of keys) {
      const result = parseKey(state, key, sections.layer());

      state = result.state;

      if (result.status !== 'action') {
        continue;
      }

      if (isSectionKeyAction(result.action)) {
        sections.execute(result.action);
      } else {
        otherActions.push(result.action);
      }
    }
  };

  return {
    sections,
    press,
    writes,
    runCalls,
    otherActions,
    marked: () => readSection(store.get),
    mark: (section: Section) => {
      writeSection(store.set, section);
    },
    hideSidebar: () => {
      shown.delete('sidebar');
    },
  };
};

describe('marked section', () => {
  test('tab writes sidebar to the shared store and a second tab writes panes', () => {
    const session = createSession();

    session.press('tab', 'tab');

    expect(session.writes).toEqual(['sidebar', 'panes']);
  });

  test('shift-tab marks the sidebar from panes', () => {
    const session = createSession();

    session.press('shift-tab');

    expect(session.marked()).toBe('sidebar');
  });

  test('escape writes panes while the sidebar is marked', () => {
    const session = createSession();

    session.press('tab', 'escape');

    expect(session.writes).toEqual(['sidebar', 'panes']);
  });

  test('escape after a pending prefix keeps the mark', () => {
    const session = createSession();

    session.press('tab', 'g', 'escape');

    expect(session.marked()).toBe('sidebar');
  });

  test('tab keeps panes and writes nothing while the sidebar is hidden', () => {
    const session = createSession();

    session.hideSidebar();
    session.press('tab', 'shift-tab');

    expect(session.marked()).toBe('panes');
    expect(session.writes).toEqual([]);
  });

  test('a marked sidebar that hides reads as panes after the next check', () => {
    const session = createSession();

    session.press('tab');
    session.hideSidebar();
    session.sections.check();

    expect(session.marked()).toBe('panes');
  });

  test('a check writes nothing while the marked section is shown', () => {
    const session = createSession();

    session.press('tab');
    session.sections.check();
    session.sections.check();

    expect(session.writes).toEqual(['sidebar']);
  });

  test('reset writes panes once', () => {
    const session = createSession();

    session.press('tab');
    session.sections.reset();
    session.sections.reset();

    expect(session.writes).toEqual(['sidebar', 'panes']);
  });
});

describe('list keys', () => {
  test('each list key runs one sidebar list command while the sidebar is marked', () => {
    const session = createSession();

    session.press('tab', 'j', 'k', 'g', 'g', 'G', 'ctrl-d', 'ctrl-u', 'enter');

    expect(session.runCalls).toEqual([
      { command: 'koja-spaces.list-down', args: undefined },
      { command: 'koja-spaces.list-up', args: undefined },
      { command: 'koja-spaces.list-first', args: undefined },
      { command: 'koja-spaces.list-last', args: undefined },
      { command: 'koja-spaces.list-half-page-down', args: undefined },
      { command: 'koja-spaces.list-half-page-up', args: undefined },
      { command: 'koja-spaces.list-open', args: undefined },
    ]);

    expect(session.otherActions).toEqual([]);
  });

  test('s j still resolves to the space step while the sidebar is marked', () => {
    const session = createSession();

    session.press('tab', 's', 'j');

    expect(session.otherActions).toEqual([{ kind: 'command', command: 'space.next' }]);
    expect(session.runCalls).toEqual([]);
  });

  test('g t and a counted g t still reach the tabs while the sidebar is marked', () => {
    const session = createSession();

    session.press('tab', 'g', 't', '3', 'g', 't');

    expect(session.otherActions).toEqual([
      { kind: 'command', command: 'tab.next' },
      { kind: 'nthTab', index: 3 },
    ]);

    expect(session.runCalls).toEqual([]);
  });

  test('with panes marked, j moves between panes and enter leaves', () => {
    const session = createSession();

    session.press('j', 'enter');

    expect(session.otherActions).toEqual([
      { kind: 'command', command: 'pane.go', args: { direction: 'down' } },
      { kind: 'leave' },
    ]);

    expect(session.runCalls).toEqual([]);
  });

  test('a list key runs no list command after the marked sidebar hides', () => {
    const session = createSession();

    session.press('tab');
    session.hideSidebar();
    session.press('j');

    expect(session.runCalls).toEqual([]);
    expect(session.marked()).toBe('panes');

    expect(session.otherActions).toEqual([
      { kind: 'command', command: 'pane.go', args: { direction: 'down' } },
    ]);
  });

  test('a list action runs nothing while panes is marked', () => {
    const session = createSession();

    session.sections.execute({ kind: 'list', action: 'down' });

    expect(session.runCalls).toEqual([]);
  });

  test('a list action runs nothing for a sidebar marked by another writer after it hides', () => {
    const session = createSession();

    session.mark('sidebar');
    session.hideSidebar();
    session.sections.execute({ kind: 'list', action: 'down' });

    expect(session.runCalls).toEqual([]);
  });
});
