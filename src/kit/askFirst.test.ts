import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';

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

let focusValue: { space: string; tab: string } | null = null;

let spaceValues: SpaceValue[] = [];

let openedSpecs: OpenedSpec[] = [];

let runCalls: RunCall[] = [];

await mock.module('herdr', () =>
  herdrFake({
    focused: () => focusValue,
    openOverlay: (spec: OpenedSpec) => {
      openedSpecs.push(spec);

      return 'overlay-1';
    },
    run: (name: string, args?: Record<string, unknown>) => {
      runCalls.push({ name, args });

      return null;
    },
    spaces: () => spaceValues,
  }),
);

const { askFirst, dialogFor } = await import('./askFirst.ts');

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

  openedSpecs = [];

  runCalls = [];
});

describe('dialogFor', () => {
  test('asks before closing the focused space, and the confirm runs it with confirmed', () => {
    const plan = dialogFor('space.close', {}, spaceValues, focusValue);

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
    const plan = dialogFor('space.close', { id: 's2', confirmed: true }, spaceValues, focusValue);

    expect(plan).toEqual({ kind: 'run' });
  });

  test('closing a space by id asks for that space, not the focused one', () => {
    const plan = dialogFor('space.close', { id: 's2' }, spaceValues, focusValue);

    expect(plan).toMatchObject({
      kind: 'confirm',
      dialog: { command: { name: 'space.close', args: { id: 's2', confirmed: true } } },
    });
  });

  test('renaming a space opens a prompt with the current name', () => {
    const plan = dialogFor('space.rename', { id: 's2' }, spaceValues, focusValue);

    expect(plan).toMatchObject({
      kind: 'prompt',
      dialog: { value: 'web', command: { name: 'space.rename', args: { id: 's2' } } },
    });
  });

  test('renaming the focused tab opens a prompt with its current name', () => {
    const plan = dialogFor('tab.rename', {}, spaceValues, focusValue);

    expect(plan).toMatchObject({
      kind: 'prompt',
      dialog: { value: 'server', command: { name: 'tab.rename', args: { id: 't2' } } },
    });
  });

  test('renaming a tab by id finds it in any space', () => {
    const plan = dialogFor('tab.rename', { id: 't3' }, spaceValues, focusValue);

    expect(plan).toMatchObject({
      kind: 'prompt',
      dialog: { value: 'build', command: { name: 'tab.rename', args: { id: 't3' } } },
    });
  });

  test('renaming an unnamed tab opens an empty prompt', () => {
    const spacesWithUnnamedTab: SpaceValue[] = [
      {
        id: 's1',
        name: 'api',
        named: true,
        tabs: [{ id: 't2', name: '2', named: false, panes: 1 }],
      },
    ];

    const plan = dialogFor('tab.rename', { id: 't2' }, spacesWithUnnamedTab, focusValue);

    expect(plan).toMatchObject({ kind: 'prompt', dialog: { value: '' } });
  });

  test('a rename that already has a name runs as is', () => {
    const plan = dialogFor('tab.rename', { id: 't2', name: 'api' }, spaceValues, focusValue);

    expect(plan).toEqual({ kind: 'run' });
  });

  test('a tab rename to an empty name runs as is, to reset automatic naming', () => {
    const plan = dialogFor('tab.rename', { id: 't2', name: '' }, spaceValues, focusValue);

    expect(plan).toEqual({ kind: 'run' });
  });

  test('a stale id opens nothing and runs nothing', () => {
    const renamePlan = dialogFor('tab.rename', { id: 'gone' }, spaceValues, focusValue);
    const closePlan = dialogFor('space.close', { id: 'gone' }, spaceValues, focusValue);

    expect(renamePlan).toEqual({ kind: 'skip' });
    expect(closePlan).toEqual({ kind: 'skip' });
  });

  test('without a focused space, a rename with no id opens nothing and runs nothing', () => {
    const plan = dialogFor('space.rename', {}, spaceValues, null);

    expect(plan).toEqual({ kind: 'skip' });
  });

  test('closing the last tab of a space asks first, and the confirm runs it with confirmed', () => {
    const plan = dialogFor('tab.close', { id: 't3' }, spaceValues, focusValue);

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
    const plan = dialogFor('tab.close', { id: 't1' }, spaceValues, focusValue);

    expect(plan).toEqual({ kind: 'run' });
  });

  test('closing the focused tab with no id asks only when it is the last tab', () => {
    const onlyTabFocus = { space: 's2', tab: 't3' };

    expect(dialogFor('tab.close', {}, spaceValues, onlyTabFocus).kind).toBe('confirm');
    expect(dialogFor('tab.close', {}, spaceValues, focusValue)).toEqual({ kind: 'run' });
  });

  test('closing a last tab that is already confirmed runs as is', () => {
    const plan = dialogFor('tab.close', { id: 't3', confirmed: true }, spaceValues, focusValue);

    expect(plan).toEqual({ kind: 'run' });
  });

  test('closing a stale tab id skips', () => {
    const plan = dialogFor('tab.close', { id: 'gone' }, spaceValues, focusValue);

    expect(plan).toEqual({ kind: 'skip' });
  });

  test('an unrelated command runs as is', () => {
    const plan = dialogFor('pane.split', { direction: 'right' }, spaceValues, focusValue);

    expect(plan).toEqual({ kind: 'run' });
  });
});

describe('askFirst', () => {
  test('opens the confirm mod for a space close and runs nothing yet', () => {
    askFirst('space.close', {});

    expect(openedSpecs.map((spec) => spec.mod)).toEqual(['koja-confirm']);
    expect(runCalls).toEqual([]);
  });

  test('opens the prompt mod for a tab rename', () => {
    askFirst('tab.rename', { id: 't1' });

    expect(openedSpecs.map((spec) => spec.mod)).toEqual(['koja-prompt']);
    expect(runCalls).toEqual([]);
  });

  test('runs a rename that already has a name', () => {
    askFirst('space.rename', { id: 's1', name: 'core' });

    expect(openedSpecs).toEqual([]);
    expect(runCalls).toEqual([{ name: 'space.rename', args: { id: 's1', name: 'core' } }]);
  });

  test('opens nothing and runs nothing for a stale id', () => {
    askFirst('tab.rename', { id: 'gone' });

    expect(openedSpecs).toEqual([]);
    expect(runCalls).toEqual([]);
  });

  test('closing the focused last tab with no args opens the confirm and runs nothing', () => {
    focusValue = { space: 's2', tab: 't3' };

    askFirst('tab.close');

    expect(openedSpecs.map((spec) => spec.mod)).toEqual(['koja-confirm']);
    expect(runCalls).toEqual([]);
  });

  test('closing the focused tab with siblings and no args runs it with the absent args', () => {
    askFirst('tab.close');

    expect(openedSpecs).toEqual([]);
    expect(runCalls).toEqual([{ name: 'tab.close', args: undefined }]);
  });
});
