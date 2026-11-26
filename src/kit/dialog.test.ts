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
    body?: DrawnElement;
    destructive?: boolean;
    actions: DrawnElement[];
  }) => DrawnElement;
};

const textPath = './text.ts';

const { bodyText } = (await import(textPath)) as {
  bodyText: (text: string) => DrawnElement;
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

const indentOf = (card: DrawnElement): unknown[] =>
  elementsWithStyle(card, 'pl').map((element) => element.styles['pl']);

describe('dialogFrame', () => {
  test('draws the overlay card surface and outline', () => {
    const card = dialogFrame({ id: 'confirm', title: 'Close space “api”?', actions: [] });

    expect(card.backgroundColors).toContain(palette.popover);
    expect(card.borderColors).toContain(palette.border);
  });

  test('draws the title in the body size, semibold, with no Esc hint', () => {
    const card = dialogFrame({
      id: 'confirm',
      title: 'Close space “api”?',
      lines: ['2 tabs close.'],
      actions: [],
    });

    const title = elementWithText(card, 'Close space “api”?');
    const line = elementWithText(card, '2 tabs close.');

    expect(title?.styles['text_size']).toEqual(line?.styles['text_size']);
    expect(title?.styles['font_semibold']).toEqual([]);
    expect(title?.textColors).toContain(palette.foreground);
    expect(drawnTexts(card)).not.toContain('Esc');
  });

  test('a destructive ask draws the red mark before the title and indents only its body', () => {
    const title = 'Close space “api”?';

    const destructive = dialogFrame({
      id: 'confirm',
      title,
      lines: ['2 tabs close.'],
      destructive: true,
      actions: [],
    });

    const harmless = dialogFrame({
      id: 'confirm',
      title,
      lines: ['2 tabs close.'],
      actions: [],
    });

    const mark = elementWithIcon(destructive, 'triangle-alert.svg');

    expect(mark?.textColors).toContain(palette.blocked);
    expect(destructive.kids[0]?.kids[0]).toBe(mark as DrawnElement);
    expect(indentOf(destructive)).not.toEqual([]);
    expect(indentOf(harmless)).toEqual([]);
    expect(drawnIcons(harmless)).not.toContain('triangle-alert.svg');
  });

  test('draws each body line in the muted ink', () => {
    const card = dialogFrame({
      id: 'confirm',
      title: 'Close space “api”?',
      lines: ['Claude Code stops mid-task, and 2 tabs close.', 'Its folder stays.'],
      actions: [],
    });

    for (const line of ['Claude Code stops mid-task, and 2 tabs close.', 'Its folder stays.']) {
      expect(elementWithText(card, line)?.textColors).toContain(palette.muted);
    }
  });

  test('draws a custom body after the lines', () => {
    const field = bodyText('Rename field');

    const card = dialogFrame({
      id: 'prompt',
      title: 'Rename space',
      lines: ['Its folder stays.'],
      body: field,
      actions: [],
    });

    const body = card.kids[1] as DrawnElement;

    expect(drawnTexts(card)).toContain('Rename field');
    expect(drawnTexts(body)).toEqual(['Its folder stays.', 'Rename field']);
  });

  test('puts the actions last and at the end of the row', () => {
    const card = dialogFrame({
      id: 'confirm',
      title: 'Close space “api”?',
      lines: ['2 tabs close.'],
      actions: actions(),
    });

    const row = card.kids.at(-1) as DrawnElement;

    expect(row.styles['justify_end']).toEqual([]);
    expect(row.kids).toHaveLength(2);
  });

  test('only the main action shows the Enter keycap, and Cancel stays plain', () => {
    const card = dialogFrame({ id: 'confirm', title: 'Close space “api”?', actions: actions() });
    const row = card.kids.at(-1) as DrawnElement;
    const [cancel, main] = row.kids;

    expect(drawnTexts(cancel as DrawnElement)).not.toContain('↵');
    expect(drawnTexts(main as DrawnElement)).toContain('↵');
  });
});
