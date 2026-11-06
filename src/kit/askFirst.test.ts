import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';
import { writeSpaceOrder } from './spaceOrder.ts';

interface RunCall {
  name: string;
  args: Record<string, unknown> | undefined;
}

interface OpenedSpec {
  mod?: string;
  props?: Record<string, unknown>;
}

interface TabValue {
  id: string;
  name: string;
  named: boolean;
  panes: number;
}

interface SpaceValue {
  id: string;
  name: string;
  named: boolean;
  tabs: TabValue[];
}

interface PaneValue {
  pane: string;
  terminal: string | null;
  tab: string;
}

let focusValue: { space: string; tab: string } | null = null;

let spaceValues: SpaceValue[] = [];

let paneValues: PaneValue[] = [];

let openedSpecs: OpenedSpec[] = [];

let runCalls: RunCall[] = [];

let sharedValues: Record<string, unknown> = {};

await mock.module('herdr', () =>
  herdrFake({
    focused: () => focusValue,
    openOverlay: (spec: OpenedSpec) => {
      openedSpecs.push(spec);

      return 'overlay-1';
    },
    panes: () => paneValues,
    run: (name: string, args?: Record<string, unknown>) => {
      runCalls.push({ name, args });

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => spaceValues,
  }),
);

const { askFirst } = await import('./askFirst.ts');

const publishSidebarOrder = (shown: string[]): void => {
  writeSpaceOrder(
    (key, value) => {
      sharedValues[key] = value;
    },
    { shown, hidden: [] },
  );
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  focusValue = { space: 's1', tab: 't2' };

  spaceValues = [
    {
      id: 's1',
      name: 'api',
      named: true,
      tabs: [
        { id: 't1', name: 'logs', named: true, panes: 1 },
        { id: 't2', name: 'server', named: true, panes: 2 },
      ],
    },
    {
      id: 's2',
      name: 'web',
      named: true,
      tabs: [{ id: 't3', name: 'build', named: true, panes: 1 }],
    },
  ];

  paneValues = [];

  openedSpecs = [];

  runCalls = [];

  sharedValues = {};
});

describe('askFirst', () => {
  test('opens the confirm mod for a space close and runs nothing yet', () => {
    const opened = askFirst('space.close', {});

    expect(opened).toBe(true);
    expect(openedSpecs.map((spec) => spec.mod)).toEqual(['koja-confirm']);
    expect(runCalls).toEqual([]);
  });

  test('opens the prompt mod for a tab rename', () => {
    const opened = askFirst('tab.rename', { id: 't1' });

    expect(opened).toBe(true);
    expect(openedSpecs.map((spec) => spec.mod)).toEqual(['koja-prompt']);
    expect(runCalls).toEqual([]);
  });

  test('runs a rename that already has a name', () => {
    const opened = askFirst('space.rename', { id: 's1', name: 'core' });

    expect(opened).toBe(false);
    expect(openedSpecs).toEqual([]);
    expect(runCalls).toEqual([{ name: 'space.rename', args: { id: 's1', name: 'core' } }]);
  });

  test('opens nothing and runs nothing for a stale id', () => {
    const opened = askFirst('tab.rename', { id: 'gone' });

    expect(opened).toBe(false);
    expect(openedSpecs).toEqual([]);
    expect(runCalls).toEqual([]);
  });

  test('closing the focused last tab with no args opens the confirm and runs nothing', () => {
    focusValue = { space: 's2', tab: 't3' };

    const opened = askFirst('tab.close');

    expect(opened).toBe(true);
    expect(openedSpecs.map((spec) => spec.mod)).toEqual(['koja-confirm']);
    expect(runCalls).toEqual([]);
  });

  test('closing the focused tab with siblings and no args runs it with the absent args', () => {
    const opened = askFirst('tab.close');

    expect(opened).toBe(false);
    expect(openedSpecs).toEqual([]);
    expect(runCalls).toEqual([{ name: 'tab.close', args: undefined }]);
  });

  test('the confirm detail counts the spaces panes that hold a terminal', () => {
    paneValues = [
      { pane: 'm1', terminal: null, tab: 't1' },
      { pane: 'p1', terminal: 'x1', tab: 't2' },
      { pane: 'p2', terminal: 'x2', tab: 't2' },
    ];

    askFirst('space.close', {});

    expect(openedSpecs[0]?.props?.['detail']).toBe('api — 2 tabs, 2 terminals');
  });

  test('next space selects the next space in sidebar order, not Herdr order', () => {
    publishSidebarOrder(['s2', 's1']);

    focusValue = { space: 's2', tab: 't3' };

    const opened = askFirst('space.next');

    expect(opened).toBe(false);
    expect(runCalls).toEqual([{ name: 'space.select', args: { id: 's1' } }]);
  });

  test('previous space runs space.prev when the sidebar published no order', () => {
    askFirst('space.prev');

    expect(runCalls).toEqual([{ name: 'space.prev', args: undefined }]);
  });

  test('previous space runs space.prev when the focused space is not in the sidebar order', () => {
    publishSidebarOrder(['s2', 's1']);
    focusValue = { space: 'unknown', tab: 't9' };

    askFirst('space.prev');

    expect(runCalls).toEqual([{ name: 'space.prev', args: undefined }]);
  });

  test('previous space runs space.prev when nothing is focused', () => {
    publishSidebarOrder(['s2', 's1']);
    focusValue = null;

    askFirst('space.prev');

    expect(runCalls).toEqual([{ name: 'space.prev', args: undefined }]);
  });
});
