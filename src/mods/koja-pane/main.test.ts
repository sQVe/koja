import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, drawn, drawnTexts, elementsWithStyle } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import { recordOf, stringOf } from '../../kit/fields.ts';
import { normalFocusFill, toPalette } from '../../kit/palette.ts';
import { paneActions } from '../../kit/paneHeaderMenuModel.ts';

const accent = '#4e4e8f';

let focused = false;
let normalMode = false;
let paneTerminal: string | null = 't1';
let terminalRecords: unknown[] = [];
let terminalReads = 0;

const askedCommands: { command: string; args: unknown }[] = [];

const textElement = (text: string): DrawnElement => {
  const element = drawn();

  element.texts.push(text);

  return element;
};

const pane = (): Record<string, unknown> => ({
  pane: 'p1',
  terminal: paneTerminal,
  tab: 'tb1',
  title: 'zsh',
  cwd: null,
  branch: null,
  status: null,
  app: null,
  program: null,
  focused,
  zoomed: false,
});

Object.assign(globalThis, { kojaModName: 'koja-pane' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), image: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({
    panes: () => [pane()],
    props: () => ({ pane: 'p1' }),
    shared: (key: string) => (key === 'koja-modal' && normalMode ? true : undefined),
    terminals: () => {
      terminalReads += 1;

      return terminalRecords;
    },
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    askFirst: (command: string, args: unknown) => {
      askedCommands.push({ command, args });

      return true;
    },
    colors: () => toPalette({ accent, foreground: '#1e2028' }),
    iconButton: () => drawn(),
    normalFocusFill,
    paneActions,
    programIcon: () => drawn(),
    radius: { cardInner: 7 },
    recordOf,
    roleBadge: (role: string) => textElement(role),
    roleText: (_role: string, text: string) => textElement(text),
    stringOf,
    withTextRole: (element: unknown) => element,
  }),
);

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const modulePath = './main.ts';

const loaded = (await import(modulePath)) as {
  default: new () => { render: () => DrawnElement };
};

afterAll(() => {
  mock.restore();
});

afterEach(() => {
  focused = false;
  normalMode = false;
  paneTerminal = 't1';
  terminalRecords = [];
  terminalReads = 0;
  askedCommands.length = 0;
});

const rendered = (): DrawnElement => new loaded.default().render();

const styleValue = (element: DrawnElement, style: string): string | null => {
  const value = element.styles[style]?.[0];

  return typeof value === 'string' ? value : null;
};

const hoveredButtons = (): DrawnElement[] => {
  focused = true;
  normalMode = false;

  const view = new loaded.default();
  const onHover = view.render().hoverHandlers[0];

  onHover?.(true, { notify: () => undefined });

  return elementsWithStyle(view.render(), 'accessibility_label');
};

const headerFill = (paneFocused: boolean, normal: boolean): unknown => {
  focused = paneFocused;
  normalMode = normal;

  return rendered().backgroundColors[0];
};

const badgePosition = (tree: DrawnElement, label: string): number => {
  const titleIndex = tree.kids.findIndex((kid) => drawnTexts(kid).includes('zsh'));
  const badgeIndex = tree.kids.findIndex((kid) => drawnTexts(kid).includes(label));

  return badgeIndex - titleIndex;
};

describe('pane header fill', () => {
  test('tints the focused header in normal mode', () => {
    expect(headerFill(true, true)).toStartWith(accent);
  });

  test('draws no fill on the focused header in insert mode', () => {
    expect(headerFill(true, false)).toBeUndefined();
  });

  test('draws no fill on an unfocused header in either mode', () => {
    expect(headerFill(false, true)).toBeUndefined();
    expect(headerFill(false, false)).toBeUndefined();
  });
});

describe('pane header role badge', () => {
  test('draws the role badge right after the title when the terminal carries a tau label', () => {
    terminalRecords = [{ address: 't1', labels: { 'tau.profile': 'worker' } }];

    expect(badgePosition(rendered(), 'worker')).toBe(1);
  });

  test('draws no role badge when the terminal carries no tau label', () => {
    terminalRecords = [{ address: 't1', labels: {} }];

    const tree = rendered();

    expect(drawnTexts(tree)).not.toContain('worker');
    expect(badgePosition(tree, 'worker')).toBe(-1);
  });

  test('draws no role badge and reads no terminals for a mod pane', () => {
    paneTerminal = null;
    terminalRecords = [{ address: 't1', labels: { 'tau.role': 'lead' } }];

    const tree = rendered();

    expect(drawnTexts(tree)).not.toContain('lead');
    expect(terminalReads).toBe(0);
  });
});

describe('pane header buttons', () => {
  test('name each button for assistive technology and in a tooltip', () => {
    const buttons = hoveredButtons();
    const names = buttons.map((button) => styleValue(button, 'accessibility_label'));
    const tooltips = buttons.map((button) => button.tooltipText);

    expect(names).toEqual(['Split right', 'Split down', 'Zoom pane', 'Close pane']);
    expect(tooltips).toEqual(names);
  });

  test('close asks first, so the last pane of a space gets the Koja dialog', () => {
    const close = hoveredButtons().find(
      (button) => styleValue(button, 'accessibility_label') === 'Close pane',
    );

    if (close !== undefined) {
      click(close);
    }

    expect(askedCommands).toEqual([{ command: 'pane.close', args: { pane: 'p1' } }]);
  });
});
