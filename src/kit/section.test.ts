import { describe, expect, test } from 'bun:test';

import type { LayoutNode } from './layout.ts';
import type { ListAction, Section } from './section.ts';
import {
  listActionOf,
  listCommand,
  readSection,
  shownSections,
  stepSection,
  writeSection,
} from './section.ts';

const memoryStore = () => {
  const values: Record<string, unknown> = {};

  return {
    get: (key: string): unknown => values[key],
    set: (key: string, value: unknown): void => {
      values[key] = value;
    },
    values,
  };
};

const layoutNode = (overrides: Partial<LayoutNode>): LayoutNode => ({
  id: 'sidebar',
  hidden: false,
  active: null,
  sizePx: null,
  trafficLights: null,
  children: [],
  ...overrides,
});

const sidebarShown = new Set<Section>(['sidebar', 'panes']);

const sidebarHidden = new Set<Section>(['panes']);

const listActions: ListAction[] = [
  'down',
  'up',
  'first',
  'last',
  'halfPageDown',
  'halfPageUp',
  'open',
];

describe('section step', () => {
  test('steps forward from panes to the sidebar and back to panes', () => {
    const first = stepSection('panes', 1, sidebarShown);
    const second = stepSection(first, 1, sidebarShown);

    expect([first, second]).toEqual(['sidebar', 'panes']);
  });

  test('steps backward from panes to the sidebar and back to panes', () => {
    const first = stepSection('panes', -1, sidebarShown);
    const second = stepSection(first, -1, sidebarShown);

    expect([first, second]).toEqual(['sidebar', 'panes']);
  });

  test('skips a hidden sidebar in both directions', () => {
    const forward = stepSection('panes', 1, sidebarHidden);
    const backward = stepSection('panes', -1, sidebarHidden);

    expect([forward, backward]).toEqual(['panes', 'panes']);
  });

  test('steps from a sidebar that is hidden to panes', () => {
    expect(stepSection('sidebar', 1, sidebarHidden)).toBe('panes');
  });

  test('keeps panes when the shown set does not list it', () => {
    expect(stepSection('panes', 1, new Set<Section>())).toBe('panes');
  });
});

describe('marked section', () => {
  test('reads back the section that was written', () => {
    const store = memoryStore();

    writeSection(store.set, 'sidebar');

    expect(readSection(store.get)).toBe('sidebar');
  });

  test('reads panes when nothing was written', () => {
    const store = memoryStore();

    expect(readSection(store.get)).toBe('panes');
  });

  test('reads panes for a value that is no section', () => {
    const store = memoryStore();

    writeSection(store.set, 'sidebar');

    for (const key of Object.keys(store.values)) {
      store.values[key] = 'footer';
    }

    expect(readSection(store.get)).toBe('panes');
  });
});

describe('list commands', () => {
  test('names the sidebar command for every list action', () => {
    const commands = listActions.map((action) => listCommand('sidebar', action));

    expect(commands).toEqual([
      'koja-spaces.list-down',
      'koja-spaces.list-up',
      'koja-spaces.list-first',
      'koja-spaces.list-last',
      'koja-spaces.list-half-page-down',
      'koja-spaces.list-half-page-up',
      'koja-spaces.list-open',
    ]);
  });

  test('panes has no list command', () => {
    expect(listCommand('panes', 'down')).toBeNull();
  });

  test('reads every sidebar command name back to its list action', () => {
    const readBack = listActions.map((action) => {
      const command = listCommand('sidebar', action) ?? '';

      return listActionOf(command.replace('koja-spaces.', ''));
    });

    expect(readBack).toEqual(listActions);
  });

  test('reads no list action from any other command', () => {
    const names = ['hold', 'list-', 'list-sideways', 'koja-spaces.list-down', 'toString'];

    expect(names.map(listActionOf)).toEqual([null, null, null, null, null]);
  });
});

describe('shown sections', () => {
  test('shows the sidebar when its layout node is not hidden', () => {
    expect([...shownSections(layoutNode({ hidden: false }))]).toEqual(['sidebar', 'panes']);
  });

  test('shows only panes when the sidebar node is hidden', () => {
    expect([...shownSections(layoutNode({ hidden: true }))]).toEqual(['panes']);
  });

  test('shows only panes when the layout has no sidebar node', () => {
    expect([...shownSections(null)]).toEqual(['panes']);
  });
});
