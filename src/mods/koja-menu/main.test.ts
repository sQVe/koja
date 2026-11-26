import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, clickablesWithText, drawn, drawnTexts, keyDown } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';

Object.assign(globalThis, { kojaModName: 'koja-menu' });

let checkingNow = false;

let execCalls: string[][] = [];

let tasks: Promise<void>[] = [];

let menuProps: Record<string, unknown> = {
  tab: 'space',
  target: { id: 'space-1' },
};

let execReply = { code: 128, stdout: '', stderr: 'fatal: not a git repository' };

let paneList: unknown[] = [];

let terminalList: unknown[] = [];

let sharedNormalMode = false;

let askedCommands: { command: string; args: Record<string, unknown> }[] = [];

const paneOf = (pane: string): unknown => ({
  pane,
  terminal: 'terminal-1',
  tab: 'tab-1',
  title: '',
  cwd: null,
  branch: null,
  status: null,
  app: null,
  program: {
    key: 'claude',
    name: 'Claude Code',
    icon: null,
    tint: false,
    tile: null,
    color: null,
    shell: false,
    agent: true,
  },
  focused: true,
  zoomed: false,
  movable: true,
});

const context = {
  focus_handle: () => ({ focus: () => undefined }),
  notify: () => undefined,
  stop_propagation: () => undefined,
  spawn: (body: (cx: unknown) => Promise<void>) => {
    tasks.push(body(context));
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
    checking: () => checkingNow,
    exec: async (command: string, args: string[]) => {
      execCalls.push([command, ...args]);

      return execReply;
    },
    panes: () => paneList,
    props: () => menuProps,
    shared: (key: string) => (key === 'koja-modal' && sharedNormalMode ? true : undefined),
    spaces: () => [{ id: 'space-1', folder: '/code/koja', machine: null, tabs: [] }],
    terminals: () => terminalList,
  }),
);

const kitParts = [
  'askFirst',
  'binding',
  'button',
  'hover',
  'hoverTarget',
  'icon',
  'keycap',
  'listRow',
  'overlay/card',
  'overlay/overlay',
  'overlay/row',
  'paneHeaderMenu',
  'paneLabel',
  'popupSurface',
  'shortcut',
  'size',
  'space',
  'stateLine',
  'text',
  'textRole',
  'theme',
  'themes',
  'window',
  'worktree',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => ({
  ...kitFake,
  askFirst: (command: string, args: Record<string, unknown>) => {
    askedCommands.push({ command, args });
  },
}));

const modulePath = './main.ts';

const loaded = (await import(modulePath)) as {
  default: new () => {
    init: (props: unknown, cx: unknown) => void;
    render: () => DrawnElement;
  };
};

const openMenu = async (): Promise<InstanceType<typeof loaded.default>> => {
  const view = new loaded.default();

  view.init(null, context);
  await Promise.all(tasks);

  return view;
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  checkingNow = false;
  execCalls = [];
  tasks = [];
  menuProps = { tab: 'space', target: { id: 'space-1' } };
  execReply = { code: 128, stdout: '', stderr: 'fatal: not a git repository' };
  paneList = [];
  terminalList = [];
  sharedNormalMode = false;
  askedCommands = [];
});

describe('space menu', () => {
  test('opening a space menu reads the git checkout of its folder', async () => {
    await openMenu();

    expect(execCalls.length).toBeGreaterThan(0);
    expect(execCalls.every((call) => call[0] === 'git')).toBe(true);
  });

  test('during herdr-app check, opening a space menu runs no git', async () => {
    checkingNow = true;

    await openMenu();

    expect(execCalls).toEqual([]);
  });

  test('show the checkout error line when the read fails', async () => {
    execReply = { code: 128, stdout: '', stderr: 'fatal: unable to read repository' };

    const view = await openMenu();

    expect(drawnTexts(view.render())).toContain('Could not read the checkout');
  });

  test('reads the checkout again when the error line asks for a retry', async () => {
    execReply = { code: 128, stdout: '', stderr: 'fatal: unable to read repository' };

    const view = await openMenu();
    const [retry] = clickablesWithText(view.render(), 'Retry');

    execCalls = [];

    if (retry !== undefined) {
      click(retry, context);
    }

    await Promise.all(tasks);

    expect(execCalls.length).toBeGreaterThan(0);
    expect(execCalls.every((call) => call[0] === 'git')).toBe(true);
  });
});

describe('pane menu', () => {
  test('draws the pane name above the pane details and actions', () => {
    menuProps = {
      tab: 'pane',
      target: { pane: 'pane-1', terminal: 'terminal-1' },
      task: 'Build window shell',
    };

    paneList = [paneOf('pane-1')];

    const view = new loaded.default();

    view.init(null, context);

    const texts = drawnTexts(view.render());

    expect(texts.indexOf('Claude Code')).toBe(0);
    expect(texts.indexOf('Claude Code')).toBeLessThan(texts.indexOf('Build window shell'));
  });

  test('draws the right-click row state after right-clicks turn on', () => {
    menuProps = {
      tab: 'pane',
      target: { pane: 'pane-1', terminal: 'terminal-1' },
    };

    terminalList = [{ address: 'terminal-1', labels: { 'herdr.right-click': 'program' } }];

    const view = new loaded.default();

    view.init(null, context);

    expect(drawnTexts(view.render())).toContain('on');
  });

  test('draws the right-click row state while right-clicks open the menu', () => {
    menuProps = {
      tab: 'pane',
      target: { pane: 'pane-1', terminal: 'terminal-1' },
    };

    terminalList = [{ address: 'terminal-1', labels: {} }];

    const view = new loaded.default();

    view.init(null, context);

    expect(drawnTexts(view.render())).toContain('off');
  });

  test('runs the selected row when Enter is pressed', () => {
    menuProps = { tab: 'pane', target: { pane: 'pane-1' } };

    const view = new loaded.default();

    view.init(null, context);

    keyDown(view.render(), 'enter', { notify: () => undefined });

    expect(askedCommands).toEqual([
      { command: 'pane.split', args: { direction: 'right', pane: 'pane-1' } },
    ]);
  });

  test('keeps the hints of the mode the menu opened in', () => {
    menuProps = { tab: 'pane', target: { pane: 'pane-1' } };
    sharedNormalMode = true;

    const view = new loaded.default();

    view.init(null, context);

    expect(drawnTexts(view.render())).toContain('v');

    sharedNormalMode = false;

    expect(drawnTexts(view.render())).toContain('v');
  });

  test('keeps insert mode free of hints after the mode turns on', () => {
    menuProps = { tab: 'pane', target: { pane: 'pane-1' } };

    const view = new loaded.default();

    view.init(null, context);

    expect(drawnTexts(view.render())).not.toContain('v');

    sharedNormalMode = true;

    expect(drawnTexts(view.render())).not.toContain('v');
  });

  test('draws the pane details before the actions', () => {
    menuProps = {
      tab: 'pane',
      target: { pane: 'pane-1', terminal: 'terminal-1' },
      task: 'Build window shell',
      branch: 'me-1089-window-shell',
      folder: '~/code/koja',
    };

    const view = new loaded.default();

    view.init(null, context);

    const texts = drawnTexts(view.render());
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
