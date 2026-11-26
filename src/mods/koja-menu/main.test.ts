import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../tests/drawn.ts';
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
    spaces: () => [{ id: 'space-1', folder: '/code/koja', machine: null, tabs: [] }],
  }),
);

const kitParts = [
  'askFirst',
  'binding',
  'hover',
  'hoverTarget',
  'icon',
  'listRow',
  'overlay/card',
  'overlay/overlay',
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

await mock.module('../../kit/index.ts', () => kitFake);

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
