import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, drawn, drawnTexts, elementsWithStyle } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import { recordOf, stringOf } from '../../kit/fields.ts';
import { normalFocusFill, toPalette } from '../../kit/palette.ts';
import { paneHeaderFields } from '../../kit/paneHeaderFields.ts';
import { paneActions } from '../../kit/paneHeaderMenuModel.ts';
import { controlSize, overlaySize, paneHeaderWidth } from '../../kit/size.ts';
import { taskOfPane } from '../../kit/tabLabel.ts';

const accent = '#4e4e8f';

let focused = false;
let normalMode = false;
let paneTerminal: string | null = 't1';
let paneCwd: string | null = null;
let paneBranch: string | null = null;
let paneStatus: string | null = null;
let terminalRecords: unknown[] = [];
let terminalReads = 0;

const askedCommands: { command: string; args: unknown }[] = [];

const openedOverlays: unknown[] = [];

const piProgram = {
  key: 'pi',
  name: 'Pi',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: false,
  agent: true,
};

let paneProgramValue: Record<string, unknown> | null = null;

const textElement = (text: string): DrawnElement => {
  const element = drawn();

  element.texts.push(text);

  return element;
};

const fakeStatusMarkWidth = (status: string | null): number => {
  if (status === 'blocked') {
    return 66;
  }

  if (status === 'working' || status === 'done') {
    return 12;
  }

  return 0;
};

const pane = (): Record<string, unknown> => ({
  pane: 'p1',
  terminal: paneTerminal,
  tab: 'tb1',
  title: 'zsh',
  cwd: paneCwd,
  branch: paneBranch,
  status: paneStatus,
  app: null,
  program: paneProgramValue,
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
    home: () => '/var/tmp/ruta-koja/home',
    panes: () => [pane()],
    props: () => ({ pane: 'p1' }),
    shared: (key: string) => (key === 'koja-modal' && normalMode ? true : undefined),
    openOverlay: (spec: unknown) => {
      openedOverlays.push(spec);

      return '';
    },
    terminals: () => {
      terminalReads += 1;

      return terminalRecords;
    },
  }),
);

const overflowModulePath = '../../kit/paneHeader.ts';

const { paneOverflowButton } = (await import(overflowModulePath)) as {
  paneOverflowButton: (onOverflow: (() => void) | undefined) => DrawnElement;
};

const badgeModulePath = '../../kit/roleBadge.ts';

const { roleBadge } = (await import(badgeModulePath)) as {
  roleBadge: (role: string, state?: 'full' | 'cut') => DrawnElement;
};

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    askFirst: (command: string, args: unknown) => {
      askedCommands.push({ command, args });

      return true;
    },
    colors: () => toPalette({ accent, foreground: '#1e2028' }),
    controlSize,
    iconButton: () => drawn(),
    normalFocusFill,
    overlaySize,
    paneActions,
    statusMarkWidth: fakeStatusMarkWidth,
    paneHeaderFields,
    paneHeaderWidth,
    paneOverflowButton,
    programIcon: () => drawn(),
    radius: { cardInner: 7 },
    recordOf,
    roleBadge: (role: string, state?: 'full' | 'cut') => {
      const badge = roleBadge(role, state);

      badge.styles['roleBadge'] = [role];

      return badge;
    },
    roleText: (_role: string, text: string) => textElement(text),
    stringOf,
    taskOfPane,
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
  paneCwd = null;
  paneBranch = null;
  paneStatus = null;
  terminalRecords = [];
  terminalReads = 0;
  askedCommands.length = 0;
  openedOverlays.length = 0;
  paneProgramValue = null;
});

const rendered = (): DrawnElement => new loaded.default().render();

const renderedAt = (width: number): DrawnElement => {
  const view = new loaded.default();
  const first = view.render();

  first.sizeHandlers[0]?.(
    { width, height: controlSize.sectionHeader },
    { notify: () => undefined },
  );

  return view.render();
};

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

const buttonsAt = (width: number): DrawnElement[] => {
  focused = false;
  normalMode = false;

  return elementsWithStyle(renderedAt(width), 'accessibility_label');
};

const hoveredAt = (width: number): DrawnElement[] => {
  focused = false;
  normalMode = false;

  const view = new loaded.default();
  const first = view.render();

  first.sizeHandlers[0]?.(
    { width, height: controlSize.sectionHeader },
    { notify: () => undefined },
  );

  first.hoverHandlers[0]?.(true, { notify: () => undefined });

  return elementsWithStyle(view.render(), 'accessibility_label');
};

const headerFill = (paneFocused: boolean, normal: boolean): unknown => {
  focused = paneFocused;
  normalMode = normal;

  return rendered().backgroundColors[0];
};

const badgeElements = (tree: DrawnElement): DrawnElement[] => elementsWithStyle(tree, 'roleBadge');

const badgeTexts = (tree: DrawnElement): string[] =>
  badgeElements(tree).flatMap((badge) => drawnTexts(badge));

const badgePosition = (tree: DrawnElement, name: string): number => {
  const titleIndex = tree.kids.findIndex((kid) => drawnTexts(kid).includes(name));
  const badgeIndex = tree.kids.findIndex((kid) => kid.styles['roleBadge'] !== undefined);

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
  test('draws the architect role badge right after the Pi title when both labels are present', () => {
    paneProgramValue = piProgram;

    terminalRecords = [
      { address: 't1', labels: { 'tau.role': 'architect', 'tau.profile': 'worker' } },
    ];

    const tree = rendered();

    expect(drawnTexts(tree)).toContain('Pi');
    expect(badgeTexts(tree)).toEqual(['architect']);
    expect(badgePosition(tree, 'Pi')).toBe(1);
  });

  test('draws the scout profile badge right after the Pi title when only the profile is present', () => {
    paneProgramValue = piProgram;
    terminalRecords = [{ address: 't1', labels: { 'tau.profile': 'scout' } }];

    const tree = rendered();

    expect(drawnTexts(tree)).toContain('Pi');
    expect(badgeTexts(tree)).toEqual(['scout']);
    expect(badgePosition(tree, 'Pi')).toBe(1);
  });

  test('draws a long profile badge with the full label as its tooltip and keeps the title space', () => {
    paneProgramValue = piProgram;
    terminalRecords = [{ address: 't1', labels: { 'tau.profile': 'integration-test-runner' } }];

    const tree = rendered();
    const [badge] = badgeElements(tree);
    const title = tree.kids.find((kid) => drawnTexts(kid).includes('Pi'));

    expect(badgeTexts(tree)).toEqual(['integration-test-runner']);
    expect(badge?.tooltipText).toBe('integration-test-runner');
    expect(title?.styles['min_w']).toEqual([controlSize.paneLabelMinWidth]);
  });

  test('draws the Pi title and no badge element when the terminal carries no tau label', () => {
    paneProgramValue = piProgram;
    terminalRecords = [{ address: 't1', labels: {} }];

    const tree = rendered();

    expect(drawnTexts(tree)).toContain('Pi');
    expect(badgeElements(tree)).toEqual([]);
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
  test('a 120 px header keeps the compact action and cuts the architect badge', () => {
    paneProgramValue = piProgram;
    paneCwd = '/var/tmp/ruta-koja/home/pi-fixture';
    terminalRecords = [{ address: 't1', labels: { 'tau.role': 'architect' } }];

    const tree = renderedAt(120);
    const [badge] = badgeElements(tree);

    const action = elementsWithStyle(tree, 'accessibility_label').find(
      (element) => styleValue(element, 'accessibility_label') === 'Pane actions',
    );

    expect(action?.styles['flex_none']).toEqual([]);
    expect(badge?.tooltipText).toBe('architect');
    expect(badge?.styles['flex_initial']).toEqual([]);
    expect(badge?.styles['min_w']).toEqual([0]);
    expect(drawnTexts(tree)).not.toContain('~/pi-fixture');
    expect(action?.styles['ml_auto']).toEqual([]);
  });

  test('a wide header draws its folder', () => {
    paneCwd = '/var/tmp/ruta-koja/home/pi-fixture';

    expect(drawnTexts(renderedAt(700))).toContain('~/pi-fixture');
  });

  test('a 233 px header with a built-in role draws its folder', () => {
    paneProgramValue = piProgram;
    paneCwd = '/var/tmp/ruta-koja/home/pi-fixture';
    terminalRecords = [{ address: 't1', labels: { 'tau.role': 'architect' } }];

    expect(drawnTexts(renderedAt(233))).toContain('~/pi-fixture');
  });

  test('a 245 px header with a short role draws its folder', () => {
    paneProgramValue = piProgram;
    paneCwd = '/var/tmp/ruta-koja/home/pi-fixture';
    terminalRecords = [{ address: 't1', labels: { 'tau.role': 'lead' } }];

    expect(drawnTexts(renderedAt(245))).toContain('~/pi-fixture');
  });

  test('a 245 px header with a working mark draws its folder', () => {
    paneProgramValue = piProgram;
    paneCwd = '/var/tmp/ruta-koja/home/pi-fixture';
    paneStatus = 'working';
    terminalRecords = [{ address: 't1', labels: { 'tau.role': 'lead' } }];

    expect(drawnTexts(renderedAt(245))).toContain('~/pi-fixture');
  });

  test('a 220 px header without a mark draws its folder', () => {
    paneProgramValue = piProgram;
    paneCwd = '/var/tmp/ruta-koja/home/pi-fixture';
    terminalRecords = [{ address: 't1', labels: { 'tau.role': 'lead' } }];

    expect(drawnTexts(renderedAt(220))).toContain('~/pi-fixture');
  });

  test('a narrow header draws its compact action without hover', () => {
    const names = buttonsAt(240).map((button) => styleValue(button, 'accessibility_label'));

    expect(names).toEqual(['Pane actions']);
  });

  test('a wide header hides its four buttons until hover', () => {
    const hidden = buttonsAt(900).map((button) => styleValue(button, 'accessibility_label'));
    const shown = hoveredAt(900).map((button) => styleValue(button, 'accessibility_label'));

    expect(hidden).toEqual([]);
    expect(shown).toEqual(['Split right', 'Split down', 'Zoom pane', 'Close pane']);
  });

  test('the compact action opens the pane menu with the pane details and actions', () => {
    paneCwd = '/var/tmp/ruta-koja/home/pi-fixture';
    paneBranch = 'me-1089-window-shell';
    terminalRecords = [{ address: 't1', labels: { 'tau.task': 'Build window shell' } }];

    const [compact] = buttonsAt(240);

    if (compact !== undefined) {
      click(compact);
    }

    expect(openedOverlays).toEqual([
      {
        mod: 'koja-menu',
        kind: 'popup',
        width: paneHeaderWidth.menuWidth,
        height: overlaySize.menuHeight,
        props: {
          tab: 'pane',
          target: { pane: 'p1', terminal: 't1' },
          task: 'Build window shell',
          branch: 'me-1089-window-shell',
          folder: '~/pi-fixture',
          overflow: true,
          zoomed: false,
        },
      },
    ]);
  });

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
