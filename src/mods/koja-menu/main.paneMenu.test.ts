import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';

Object.assign(globalThis, { kojaModName: 'koja-menu' });

const themeColors = {
  accent: '#0a0a0a',
  background: '#111111',
  blocked: '#222222',
  border: '#333333',
  canvas: '#444444',
  chrome: '#555555',
  dim: '#666666',
  done: '#777777',
  foreground: '#888888',
  hover: '#999999',
  idle: '#aaaaaa',
  muted: '#bbbbbb',
  popover: '#cccccc',
  selected: '#dddddd',
  working: '#eeeeee',
};

const overlayProps = {
  tab: 'pane',
  target: { pane: 'pane-1', terminal: 'terminal-1' },
  task: 'Build window shell',
  branch: 'me-1089-window-shell',
  folder: '~/code/koja',
};

const context = {
  focus_handle: () => ({ focus: () => undefined }),
  notify: () => undefined,
  spawn: (body: (cx: unknown) => Promise<void>) => {
    body(context).catch(() => undefined);
  },
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({
    checking: () => false,
    closeOverlay: () => null,
    exec: async () => ({ code: 0, stdout: '', stderr: '' }),
    keys: () => [],
    panes: () => [],
    props: () => overlayProps,
    spaces: () => [],
    terminals: () => [{ address: 'terminal-1', labels: {} }],
    theme: () => themeColors,
  }),
);

const kitParts = [
  'askFirst',
  'binding',
  'hover',
  'hoverTarget',
  'icon',
  'listRow',
  'overlay',
  'paneHeaderMenu',
  'popupSurface',
  'shortcut',
  'size',
  'space',
  'text',
  'textRole',
  'theme',
  'themes',
  'window',
  'worktree',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './main.ts';

const loaded = (await import(modulePath)) as {
  default: new () => {
    init: (props: unknown, cx: unknown) => void;
    render: () => DrawnElement;
  };
};

afterAll(() => {
  mock.restore();
});

const rendered = (): DrawnElement => {
  const view = new loaded.default();

  view.init(null, context);

  return view.render();
};

describe('pane menu', () => {
  test('draws the pane details before the actions', () => {
    const texts = drawnTexts(rendered());
    const task = texts.indexOf('Build window shell');
    const branch = texts.indexOf('me-1089-window-shell');
    const folder = texts.indexOf('~/code/koja');
    const split = texts.indexOf('Split right');

    expect(task).toBeGreaterThanOrEqual(0);
    expect(branch).toBeGreaterThan(task);
    expect(folder).toBeGreaterThan(branch);
    expect(split).toBeGreaterThan(folder);
  });
});
