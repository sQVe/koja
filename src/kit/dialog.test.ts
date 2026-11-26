import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  elementWithIcon,
  elementWithText,
  elementsWithStyle,
} from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { dialogSize, radius } from './size.ts';

const palette = {
  blocked: '#a3212b',
  border: '#999ca7',
  dim: '#525460',
  foreground: '#1e2028',
  muted: '#3a3d4c',
  popover: '#dcdee5',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ settings: () => ({}), theme: () => palette }));

const modulePath = './dialog.ts';

const { dialogFrame } = (await import(modulePath)) as {
  dialogFrame: (options: {
    id: string;
    title: string;
    lines?: string[];
    destructive?: boolean;
    actions: DrawnElement[];
  }) => DrawnElement;
};

const buttonPath = './button.ts';

const { dialogButton } = (await import(buttonPath)) as {
  dialogButton: (options: { label: string; kind: 'danger' | 'solid' | 'outline' }) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const actions = (): DrawnElement[] => [
  dialogButton({ label: 'Cancel', kind: 'outline' }),
  dialogButton({ label: 'Close', kind: 'danger' }),
];

describe('dialogFrame', () => {
  test('draws the overlay card surface and outline at the dialog padding and block gap', () => {
    const card = dialogFrame({ id: 'confirm', title: 'Close space “api”?', actions: [] });

    expect(card.backgroundColors).toContain(palette.popover);
    expect(card.borderColors).toContain(palette.border);
    expect(card.styles['rounded']).toEqual([radius.dialog]);
    expect(card.styles['p']).toEqual([dialogSize.padding]);
    expect(card.styles['pt']).toEqual([dialogSize.padding - dialogSize.titleTrim]);
    expect(card.styles['gap']).toEqual([dialogSize.blockGap]);
    expect(card.styles['w_full']).toEqual([]);
  });

  test('draws the title in one 13 px semibold size and no Esc hint', () => {
    const card = dialogFrame({ id: 'confirm', title: 'Close space “api”?', actions: [] });
    const title = elementWithText(card, 'Close space “api”?');

    expect(title?.styles['text_size']).toEqual([13]);
    expect(title?.styles['font_semibold']).toEqual([]);
    expect(title?.textColors).toContain(palette.foreground);
    expect(drawnTexts(card)).not.toContain('Esc');
  });

  test('a destructive ask draws the red mark before the title and indents the body', () => {
    const card = dialogFrame({
      id: 'confirm',
      title: 'Close space “api”?',
      lines: ['2 tabs close.'],
      destructive: true,
      actions: [],
    });

    const mark = elementWithIcon(card, 'triangle-alert.svg');

    expect(drawnIcons(card)).toContain('triangle-alert.svg');
    expect(mark?.textColors).toContain(palette.blocked);
    expect(mark?.styles['mt']).toEqual([dialogSize.markTop]);

    const indented = elementsWithStyle(card, 'pl');

    expect(indented.map((element) => element.styles['pl'])).toEqual([[dialogSize.markInset]]);
    expect(drawnTexts(card)).toContain('2 tabs close.');
  });

  test('draws each body line in the body size and muted ink', () => {
    const card = dialogFrame({
      id: 'confirm',
      title: 'Close space “api”?',
      lines: ['Claude Code stops mid-task, and 2 tabs close.', 'Its folder stays.'],
      actions: [],
    });

    for (const line of ['Claude Code stops mid-task, and 2 tabs close.', 'Its folder stays.']) {
      const element = elementWithText(card, line);

      expect(element?.styles['text_size']).toEqual([13]);
      expect(element?.textColors).toContain(palette.muted);
    }
  });

  test('puts the actions at the end, 8 px apart and 4 px below the block above', () => {
    const card = dialogFrame({
      id: 'confirm',
      title: 'Close space “api”?',
      lines: ['2 tabs close.'],
      actions: actions(),
    });

    const row = card.kids.at(-1) as DrawnElement;

    expect(row.styles['gap']).toEqual([dialogSize.blockGap]);
    expect(row.styles['mt']).toEqual([dialogSize.actionGap - dialogSize.blockGap]);
    expect(row.styles['justify_end']).toEqual([]);
  });

  test('only the main action shows the Enter keycap, and Cancel stays plain', () => {
    const card = dialogFrame({ id: 'confirm', title: 'Close space “api”?', actions: actions() });
    const row = card.kids.at(-1) as DrawnElement;
    const [cancel, main] = row.kids;

    expect(drawnTexts(cancel as DrawnElement)).not.toContain('↵');
    expect(drawnTexts(main as DrawnElement)).toContain('↵');
  });
});
