import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  click,
  clickablesWithIcon,
  clickablesWithText,
  drawn,
  drawnIcons,
  drawnTexts,
  elementsWithStyle,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { rowHeight, separatorHeight } from './size.ts';

interface SplitButtonChoice {
  label: string;
  current?: boolean;
  divided?: boolean;
  action: () => void;
}

interface SplitButtonOptions {
  label: string;
  open: boolean;
  onMainAction: () => void;
  onToggleMenu: () => void;
  choices: SplitButtonChoice[];
}

const palette = {
  border: '#1a1a1a',
  muted: '#3c3c4c',
  solid: '#4d4d5d',
  solid_foreground: '#e5e5f5',
};

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './splitButton.ts';

const { splitButton, splitButtonOpenHeight } = (await import(modulePath)) as {
  splitButton: (options: SplitButtonOptions) => DrawnElement;
  splitButtonOpenHeight: (choices: readonly SplitButtonChoice[]) => number;
};

afterAll(() => {
  mock.restore();
});

const nothing = (): void => undefined;

const recorder = () => {
  const calls: string[] = [];

  const note = (name: string): void => {
    calls.push(name);
  };

  return {
    calls,
    note,
    record: (name: string) => () => {
      note(name);
    },
  };
};

const mergeChoices = (note: (name: string) => void): SplitButtonChoice[] => [
  {
    label: 'Squash and merge',
    current: true,
    action: () => {
      note('squash');
    },
  },
  {
    label: 'Ask agent to merge',
    divided: true,
    action: () => {
      note('ask');
    },
  },
  {
    label: 'Merge commit',
    action: () => {
      note('commit');
    },
  },
  {
    label: 'Rebase and merge',
    action: () => {
      note('rebase');
    },
  },
];

const closedButton = (options: {
  main?: () => void;
  menu?: () => void;
  choices?: SplitButtonChoice[];
}): DrawnElement =>
  splitButton({
    label: 'Squash and merge',
    open: false,
    onMainAction: options.main ?? nothing,
    onToggleMenu: options.menu ?? nothing,
    choices: options.choices ?? mergeChoices(nothing),
  });

const openButton = (choices: SplitButtonChoice[]): DrawnElement =>
  splitButton({
    label: 'Squash and merge',
    open: true,
    onMainAction: nothing,
    onToggleMenu: nothing,
    choices,
  });

describe('splitButton', () => {
  test('the label runs the main action and the chevron opens the menu, without running the action', () => {
    const { calls, record } = recorder();
    const button = closedButton({ main: record('main'), menu: record('menu') });

    const label = clickablesWithText(button, 'Squash and merge')[0] ?? drawn();
    const chevron = clickablesWithIcon(button, 'chevron-down.svg')[0] ?? drawn();

    click(label);
    click(chevron);

    expect(calls).toEqual(['main', 'menu']);
  });

  test('a closed button draws no menu, and an open one draws every choice', () => {
    const choices = mergeChoices(nothing);

    expect(drawnTexts(closedButton({ choices }))).toEqual(['Squash and merge']);

    expect(drawnTexts(openButton(choices))).toEqual([
      'Squash and merge',
      'Squash and merge',
      'Ask agent to merge',
      'Merge commit',
      'Rebase and merge',
    ]);
  });

  test('choosing a menu row runs that choice and not the main action', () => {
    const { calls, note, record } = recorder();

    const button = splitButton({
      label: 'Squash and merge',
      open: true,
      onMainAction: record('main'),
      onToggleMenu: record('menu'),
      choices: mergeChoices(note),
    });

    const row = clickablesWithText(button, 'Merge commit')[0] ?? drawn();

    click(row);

    expect(calls).toEqual(['commit']);
  });

  test('the menu marks the current choice and only that choice', () => {
    const marked = openButton([
      { label: 'Squash and merge', current: true, action: nothing },
      { label: 'Merge commit', action: nothing },
    ]);

    const marks = drawnIcons(marked).filter((name) => name === 'check.svg');

    expect(marks).toHaveLength(1);

    const unmarked = openButton([
      { label: 'Squash and merge', action: nothing },
      { label: 'Merge commit', action: nothing },
    ]);

    expect(drawnIcons(unmarked)).not.toContain('check.svg');
  });

  test('an open menu leaves room for each row and one more line for a divided choice', () => {
    const one = [{ label: 'Squash and merge', action: nothing }];

    const two = [...one, { label: 'Merge commit', action: nothing }];

    const divided = [
      { label: 'Squash and merge', action: nothing },
      { label: 'Ask agent to merge', divided: true, action: nothing },
    ];

    expect(splitButtonOpenHeight(two) - splitButtonOpenHeight(one)).toBe(rowHeight.small);
    expect(splitButtonOpenHeight(divided) - splitButtonOpenHeight(two)).toBe(separatorHeight);
  });

  test('a divided first choice draws no line above the menu', () => {
    const divided = openButton([{ label: 'Squash and merge', divided: true, action: nothing }]);
    const plain = openButton([{ label: 'Squash and merge', action: nothing }]);

    const [dividedMenu] = elementsWithStyle(divided, 'id');
    const [plainMenu] = elementsWithStyle(plain, 'id');

    expect(dividedMenu?.kids).toHaveLength(plainMenu?.kids.length ?? 0);
  });

  test('a divided choice adds one line above the choice', () => {
    const divided = openButton([
      { label: 'Squash and merge', current: true, action: nothing },
      { label: 'Ask agent to merge', divided: true, action: nothing },
    ]);

    const undivided = openButton([
      { label: 'Squash and merge', current: true, action: nothing },
      { label: 'Ask agent to merge', action: nothing },
    ]);

    const [dividedMenu] = elementsWithStyle(divided, 'id');
    const [plainMenu] = elementsWithStyle(undivided, 'id');

    expect(dividedMenu?.kids).toHaveLength((plainMenu?.kids.length ?? 0) + 1);
  });
});
