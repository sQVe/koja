import { afterAll, describe, expect, mock, test } from 'bun:test';

import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { recordOf, stringOf } from '../../kit/fields.ts';
import { normalFocusFill, toPalette } from '../../kit/palette.ts';
import { paneActions } from '../../kit/paneHeaderMenuModel.ts';

interface RecordedElement {
  styles: Record<string, unknown>;
}

type HoverHandler = (hovered: boolean, cx: { notify: () => void }) => void;

type ClickHandler = (event: unknown, cx: { stop_propagation: () => void }) => void;

const recorded = (): RecordedElement => {
  const element: RecordedElement = { styles: {} };

  const handle: RecordedElement = new Proxy(element, {
    get: (target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key === 'styles') {
        return target.styles;
      }

      return (...args: unknown[]) => {
        element.styles[String(key)] = args[0];

        return handle;
      };
    },
  });

  return handle;
};

const accent = '#4e4e8f';

let focused = false;
let normalMode = false;

const askedCommands: { command: string; args: unknown }[] = [];

const pane = (): Record<string, unknown> => ({
  pane: 'p1',
  terminal: 't1',
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

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => recorded() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => chainable(), image: () => chainable(), svg: () => chainable() }),
);

await mock.module('herdr', () =>
  herdrFake({
    panes: () => [pane()],
    props: () => ({ pane: 'p1' }),
    shared: (key: string) => (key === 'koja-modal' && normalMode ? true : undefined),
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    askFirst: (command: string, args: unknown) => {
      askedCommands.push({ command, args });

      return true;
    },
    colors: () => toPalette({ accent, foreground: '#1e2028' }),
    iconButton: () => recorded(),
    normalFocusFill,
    paneActions,
    programIcon: () => chainable(),
    radius: { cardInner: 7 },
    recordOf,
    roleText: () => chainable(),
    stringOf,
    withTextRole: (element: unknown) => element,
  }),
);

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const modulePath = './main.ts';

const loaded = (await import(modulePath)) as {
  default: new () => { render: () => RecordedElement };
};

afterAll(() => {
  mock.restore();
});

const hoveredButtons = (): RecordedElement[] => {
  focused = true;
  normalMode = false;

  const view = new loaded.default();
  const onHover = view.render().styles['on_hover'] as HoverHandler;

  onHover(true, { notify: () => undefined });

  return view.render().styles['children'] as RecordedElement[];
};

const headerFill = (paneFocused: boolean, normal: boolean): unknown => {
  focused = paneFocused;
  normalMode = normal;

  return new loaded.default().render().styles['bg'];
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

describe('pane header buttons', () => {
  test('name each button for assistive technology and in a tooltip', () => {
    const buttons = hoveredButtons();
    const names = buttons.map((button) => button.styles['accessibility_label']);
    const tooltips = buttons.map((button) => button.styles['tooltip']);

    expect(names).toEqual(['Split right', 'Split down', 'Zoom pane', 'Close pane']);
    expect(tooltips).toEqual(names);
  });

  test('close asks first, so the last pane of a space gets the Koja dialog', () => {
    const close = hoveredButtons().find(
      (button) => button.styles['accessibility_label'] === 'Close pane',
    );

    const onClick = close?.styles['on_click'] as ClickHandler;

    askedCommands.length = 0;
    onClick(undefined, { stop_propagation: () => undefined });

    expect(askedCommands).toEqual([{ command: 'pane.close', args: { pane: 'p1' } }]);
  });
});
