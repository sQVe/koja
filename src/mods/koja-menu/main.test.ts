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

let execCwds: string[] = [];

let spaceFolderValue = '/code/koja';

let tasks: Promise<void>[] = [];

let menuProps: Record<string, unknown> = {
  tab: 'space',
  target: { id: 'space-1' },
};

let execReply = { code: 128, stdout: '', stderr: 'fatal: not a git repository' };

let gitReplies: Record<string, { code: number; stdout: string; stderr: string }> = {};

let paneList: unknown[] = [];

let terminalList: unknown[] = [];

let sharedNormalMode = false;

let askedCommands: { command: string; args: Record<string, unknown> }[] = [];

let openedUrls: string[] = [];

let copiedTexts: string[] = [];

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
  open_url: (url: string) => {
    openedUrls.push(url);
  },
  write_to_clipboard: (text: string) => {
    copiedTexts.push(text);
  },
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
    exec: async (command: string, args: string[], options: { cwd: string }) => {
      execCalls.push([command, ...args]);
      execCwds.push(options.cwd);

      return gitReplies[args.join(' ')] ?? execReply;
    },
    panes: () => paneList,
    props: () => menuProps,
    shared: (key: string) => (key === 'koja-modal' && sharedNormalMode ? true : undefined),
    spaces: () => [{ id: 'space-1', folder: spaceFolderValue, machine: null, tabs: [] }],
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

const rightClickLabels = (to: unknown): Record<string, string> =>
  to === 'program' ? { 'herdr.right-click': 'program' } : {};

await mock.module('../../kit/index.ts', () => ({
  ...kitFake,
  askFirst: (command: string, args: Record<string, unknown>) => {
    askedCommands.push({ command, args });

    if (command === 'terminal.right_click') {
      terminalList = [{ address: 'terminal-1', labels: rightClickLabels(args['to']) }];
    }
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
  execCwds = [];
  tasks = [];
  spaceFolderValue = '/code/koja';
  menuProps = { tab: 'space', target: { id: 'space-1' } };
  execReply = { code: 128, stdout: '', stderr: 'fatal: not a git repository' };
  gitReplies = {};
  paneList = [];
  terminalList = [];
  sharedNormalMode = false;
  askedCommands = [];
  openedUrls = [];
  copiedTexts = [];
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

  test('retries the checkout the error names after the space moves', async () => {
    execReply = { code: 128, stdout: '', stderr: 'fatal: unable to read repository' };

    const view = await openMenu();
    const [retry] = clickablesWithText(view.render(), 'Retry');

    spaceFolderValue = '/code/moved';
    execCalls = [];
    execCwds = [];

    if (retry !== undefined) {
      click(retry, context);
    }

    await Promise.all(tasks);

    expect(execCwds.length).toBeGreaterThan(0);
    expect(new Set(execCwds)).toEqual(new Set(['/code/koja']));
  });

  test('starts one read when Retry is clicked twice', async () => {
    execReply = { code: 128, stdout: '', stderr: 'fatal: unable to read repository' };

    const view = await openMenu();
    const [retry] = clickablesWithText(view.render(), 'Retry');

    execCalls = [];

    if (retry !== undefined) {
      click(retry, context);
      click(retry, context);
    }

    await Promise.all(tasks);

    expect(execCalls).toHaveLength(1);
  });

  test('steps past the failed checkout line and runs the next row on Enter', async () => {
    execReply = { code: 128, stdout: '', stderr: 'fatal: unable to read repository' };

    const view = await openMenu();
    const tree = view.render();

    keyDown(tree, { key: 'down' }, { notify: () => undefined });
    keyDown(tree, { key: 'enter' }, { notify: () => undefined });

    expect(askedCommands).toEqual([{ command: 'space.close', args: { id: 'space-1' } }]);
  });

  test('choosing Open PR on GitHub hands the pull URL to the system', async () => {
    menuProps = {
      tab: 'space',
      target: { id: 'space-1' },
      pull: { number: 505, url: 'https://example.invalid/koja/pull/505' },
    };

    const view = await openMenu();
    const [row] = clickablesWithText(view.render(), 'Open PR on GitHub');

    if (row !== undefined) {
      click(row, context);
    }

    expect(openedUrls).toEqual(['https://example.invalid/koja/pull/505']);
  });

  test('pressing Enter on Copy branch name writes the branch to the clipboard', async () => {
    menuProps = { tab: 'space', target: { id: 'space-1' }, branch: 'me-1182-space-menu-links' };

    const view = await openMenu();

    keyDown(view.render(), { key: 'down' }, context);
    keyDown(view.render(), { key: 'enter' }, context);

    expect(copiedTexts).toEqual(['me-1182-space-menu-links']);
  });

  test('replaces the error line with the worktree rows when Retry succeeds', async () => {
    execReply = { code: 128, stdout: '', stderr: 'fatal: unable to read repository' };

    const view = await openMenu();
    const [retry] = clickablesWithText(view.render(), 'Retry');

    gitReplies = {
      'rev-parse --is-bare-repository --is-inside-git-dir --path-format=absolute --git-dir --git-common-dir':
        { code: 0, stdout: 'false\nfalse\n/repo/.git\n/repo/.git\n', stderr: '' },
      'rev-parse --show-toplevel': { code: 0, stdout: '/repo\n', stderr: '' },
      'symbolic-ref --quiet --short HEAD': { code: 0, stdout: 'main\n', stderr: '' },
      'rev-parse --verify --quiet HEAD': { code: 0, stdout: 'abc123\n', stderr: '' },
    };

    if (retry !== undefined) {
      click(retry, context);
    }

    await Promise.all(tasks);

    const texts = drawnTexts(view.render());

    expect(texts).toContain('New worktree');
    expect(texts).not.toContain('Could not read the checkout');
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

  test('turns the right-click row on when the row is clicked', () => {
    menuProps = {
      tab: 'pane',
      target: { pane: 'pane-1', terminal: 'terminal-1' },
    };

    terminalList = [{ address: 'terminal-1', labels: {} }];

    const view = new loaded.default();

    view.init(null, context);

    const [row] = clickablesWithText(view.render(), 'Send right-clicks to pane');

    if (row !== undefined) {
      click(row, context);
    }

    const reopened = new loaded.default();

    reopened.init(null, context);

    expect(askedCommands).toEqual([
      { command: 'terminal.right_click', args: { to: 'program', terminal: 'terminal-1' } },
    ]);

    expect(drawnTexts(reopened.render())).toContain('on');
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
    paneList = [paneOf('pane-1')];

    const view = new loaded.default();

    view.init(null, context);

    keyDown(view.render(), { key: 'enter' }, { notify: () => undefined });

    expect(askedCommands).toEqual([{ command: 'pane.rename', args: { pane: 'pane-1' } }]);
  });

  test('keeps the hints of the mode the menu opened in', () => {
    menuProps = { tab: 'pane', target: { pane: 'pane-1' } };
    paneList = [paneOf('pane-1')];
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

    paneList = [paneOf('pane-1')];

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
