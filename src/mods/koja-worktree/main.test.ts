import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  chainable,
  dialogFrameFake,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { recordOf, stringOf } from '../../kit/fields.ts';
import { spaceFolder } from '../../kit/space.ts';

type KeyHandler = (
  event: { key: string },
  cx: { stop_propagation: () => void; notify: () => void },
) => void;

interface ExecCall {
  command: string;
  args: string[];
  cwd: string | undefined;
  on: string | null | undefined;
}

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface RunCall {
  name: string;
  args: Record<string, unknown>;
}

interface Button {
  kind: string;
  click: (event: unknown, cx: unknown) => void;
}

type Call = 'close' | RunCall;

interface StateLine {
  kind: string;
  text: string;
  wrap?: boolean;
}

interface DialogView {
  init: (props: unknown, cx: unknown) => void;
  render: () => unknown;
}

const workspaceRoot = '/work/repo';

const spaceFolderPath = `${workspaceRoot}/feat-a`;

const statusCommand = 'git --no-optional-locks status --porcelain';

let calls: Call[] = [];
let execCalls: ExecCall[] = [];
let execResults: Record<string, ExecResult | Error> = {};
let dialogProps: Record<string, unknown> = {};
let spaceList: unknown[] = [];
let spaceStatuses: Record<string, string | null> = {};
let keyDownHandler: KeyHandler | null = null;
let buttons = new Map<string, Button>();
let stateLines: StateLine[] = [];
let typedValue = '';
let tasks: Promise<unknown>[] = [];
const inputHandlers = new Map<string, (event: unknown, cx: unknown) => void>();

const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' });

const failed = (stderr: string): ExecResult => ({ code: 1, stdout: '', stderr });

const defaultResults = (): Record<string, ExecResult | Error> => ({
  'git rev-parse --show-toplevel': ok(`${spaceFolderPath}\n`),
  'git rev-parse --path-format=absolute --git-common-dir': ok(`${workspaceRoot}/.bare\n`),
  [statusCommand]: ok(),
  'git worktree list --porcelain': ok(
    [
      `worktree ${workspaceRoot}/.bare`,
      'bare',
      '',
      `worktree ${spaceFolderPath}`,
      'HEAD 1111111',
      'branch refs/heads/feat/a',
      '',
      `worktree ${workspaceRoot}/feat-b`,
      'HEAD 2222222',
      'branch refs/heads/feat/b',
      '',
    ].join('\n'),
  ),
});

const fakeExec = async (
  command: string,
  args: string[] = [],
  options: { cwd?: string; on?: string | null } = {},
): Promise<ExecResult> => {
  execCalls.push({ command, args, cwd: options.cwd, on: options.on });

  const result = execResults[[command, ...args].join(' ')] ?? ok();

  if (result instanceof Error) {
    throw result;
  }

  return result;
};

const recordButton = (options: { kind: string; label: string }): unknown => {
  const element: Record<string, unknown> = {
    on_click: (handler: (event: unknown, cx: unknown) => void) => {
      buttons.set(options.label, { kind: options.kind, click: handler });

      return element;
    },
  };

  return element;
};

const inputStub = {
  on: (event: string, handler: (event: unknown, cx: unknown) => void) => {
    inputHandlers.set(event, handler);

    return true;
  },
  focus: () => undefined,
  value: () => typedValue,
};

const context = {
  focus_handle: () => ({ focus: () => undefined, is_focused: () => false }),
  timer: { after: () => undefined },
  notify: () => undefined,
  stop_propagation: () => undefined,
  spawn: (body: (cx: unknown) => unknown) => {
    tasks.push(Promise.resolve(body(context)));
  },
};

const settle = async (): Promise<void> => {
  while (tasks.length > 0) {
    const pending = tasks;
    tasks = [];
    await Promise.all(pending);
  }
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    InputState: { new: () => inputStub },
    v_flex: chainable,
  }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: chainable }));

await mock.module('herdr', () =>
  herdrFake({
    exec: fakeExec,
    props: () => dialogProps,
    run: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });

      return null;
    },
    spaces: () => spaceList,
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    closeOverlay: () => {
      calls.push('close');
    },
    detailText: chainable,
    dialogButton: recordButton,
    dialogFrame: () =>
      dialogFrameFake((handler: KeyHandler) => {
        keyDownHandler = handler;
      }),
    recordOf,
    rollupStatuses: () => ({ spaces: spaceStatuses, tabs: {} }),
    spaceFolder,
    stateLine: (options: StateLine) => {
      stateLines.push(options);

      return chainable();
    },
    stringOf,
    textField: chainable,
  }),
);

const redraw = (view: DialogView): void => {
  buttons = new Map();
  stateLines = [];
  view.render();
};

const openDialog = async (): Promise<DialogView> => {
  const modulePath = './main.ts';
  const loaded = (await import(modulePath)) as { default: new () => DialogView };
  const view = new loaded.default();

  view.init(undefined, context);
  await settle();
  redraw(view);

  return view;
};

const click = async (view: DialogView, label: string): Promise<void> => {
  buttons.get(label)?.click({}, context);
  await settle();
  redraw(view);
};

const groveCalls = (): ExecCall[] => execCalls.filter((call) => call.command === 'grove');

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  calls = [];
  execCalls = [];
  execResults = defaultResults();
  spaceStatuses = {};
  keyDownHandler = null;
  buttons = new Map();
  stateLines = [];
  typedValue = '';
  tasks = [];
  inputHandlers.clear();
  dialogProps = { action: 'remove', space: 'space-1', overlay: 'overlay-1' };

  spaceList = [{ id: 'space-1', folder: spaceFolderPath, machine: null, status: null, tabs: [] }];
});

describe('remove worktree', () => {
  test('a dirty worktree asks with a danger button before Grove removes it by force', async () => {
    execResults[statusCommand] = ok(' M src/file.ts\n');
    const view = await openDialog();

    expect(buttons.get('Remove')?.kind).toBe('danger');
    expect(groveCalls()).toEqual([]);

    await click(view, 'Remove');

    expect(groveCalls()).toEqual([
      { command: 'grove', args: ['remove', '--force', 'feat-a'], cwd: workspaceRoot, on: null },
    ]);

    expect(calls).toEqual([
      'close',
      { name: 'space.close', args: { id: 'space-1', confirmed: true } },
    ]);
  });
});

describe('remove worktree without risk', () => {
  test('a clean worktree with no agent runs Grove at once without force or a confirm button', async () => {
    await openDialog();

    expect(groveCalls()).toEqual([
      { command: 'grove', args: ['remove', 'feat-a'], cwd: workspaceRoot, on: null },
    ]);

    expect(buttons.has('Remove')).toBe(false);

    expect(calls).toEqual([
      'close',
      { name: 'space.close', args: { id: 'space-1', confirmed: true } },
    ]);
  });

  test('a clean worktree asks first when an agent runs in its space', async () => {
    spaceStatuses = { 'space-1': 'idle' };
    const view = await openDialog();

    expect(buttons.get('Remove')?.kind).toBe('danger');
    expect(groveCalls()).toEqual([]);

    await click(view, 'Remove');

    expect(groveCalls().map((call) => call.args)).toEqual([['remove', '--force', 'feat-a']]);
  });

  test('enter confirms a remove that asks first', async () => {
    spaceStatuses = { 'space-1': 'working' };
    await openDialog();

    keyDownHandler?.({ key: 'enter' }, context);
    await settle();

    expect(groveCalls().map((call) => call.args)).toEqual([['remove', '--force', 'feat-a']]);
  });

  test('a failed Grove remove shows its error, keeps the dialog, and keeps the space', async () => {
    execResults['grove remove feat-a'] = failed('worktree is locked');
    await openDialog();

    expect(stateLines).toEqual([{ kind: 'error', text: 'worktree is locked', wrap: true }]);
    expect(calls).toEqual([]);
  });

  test('a remote space runs every command on its machine', async () => {
    spaceList = [
      { id: 'space-1', folder: spaceFolderPath, machine: 'box', status: null, tabs: [] },
    ];

    await openDialog();

    expect(execCalls.map((call) => call.on)).toEqual(['box', 'box', 'box', 'box']);
  });
});

describe('worktree checks', () => {
  test('a failed git status shows its error and runs no Grove', async () => {
    execResults[statusCommand] = failed('fatal: index file corrupt');
    await openDialog();

    expect(stateLines).toEqual([{ kind: 'error', text: 'fatal: index file corrupt', wrap: true }]);
    expect(buttons.has('Remove')).toBe(false);
    expect(groveCalls()).toEqual([]);
  });

  test('a folder outside a Grove workspace shows an error and runs no Grove', async () => {
    execResults['git rev-parse --path-format=absolute --git-common-dir'] = ok(
      `${spaceFolderPath}/.git\n`,
    );

    await openDialog();

    expect(stateLines.map((line) => line.kind)).toEqual(['error']);
    expect(groveCalls()).toEqual([]);
  });

  test('a checkout outside the workspace root shows an error and removes no namesake', async () => {
    execResults['git rev-parse --show-toplevel'] = ok('/elsewhere/feat-a\n');
    await openDialog();

    expect(stateLines.map((line) => line.kind)).toEqual(['error']);
    expect(buttons.has('Remove')).toBe(false);
    expect(groveCalls()).toEqual([]);
  });

  test('a new worktree from a checkout outside the workspace root shows an error', async () => {
    dialogProps = { action: 'new', space: 'space-1', overlay: 'overlay-1' };
    execResults['git rev-parse --show-toplevel'] = ok('/elsewhere/feat-a\n');
    await openDialog();

    expect(stateLines.map((line) => line.kind)).toEqual(['error']);
    expect(buttons.has('Create')).toBe(false);
  });

  test('a rejected exec shows its error and runs no Grove', async () => {
    execResults['git rev-parse --show-toplevel'] = new Error('machine box is offline');
    await openDialog();

    expect(stateLines).toEqual([{ kind: 'error', text: 'machine box is offline', wrap: true }]);
    expect(groveCalls()).toEqual([]);
  });

  test('a space that is gone shows an error and runs nothing', async () => {
    spaceList = [];
    await openDialog();

    expect(stateLines.map((line) => line.kind)).toEqual(['error']);
    expect(execCalls).toEqual([]);
  });

  test('escape closes the dialog and runs nothing', async () => {
    spaceStatuses = { 'space-1': 'blocked' };
    await openDialog();

    keyDownHandler?.({ key: 'escape' }, context);
    await settle();

    expect(calls).toEqual(['close']);
    expect(groveCalls()).toEqual([]);
  });
});

describe('new worktree', () => {
  beforeEach(() => {
    dialogProps = { action: 'new', space: 'space-1', overlay: 'overlay-1' };
  });

  test('create runs Grove add from the workspace root, then opens a space on the new folder', async () => {
    const view = await openDialog();
    typedValue = 'feat/b';

    await click(view, 'Create');

    expect(groveCalls()).toEqual([
      { command: 'grove', args: ['add', 'feat/b'], cwd: workspaceRoot, on: null },
    ]);

    expect(calls).toEqual([
      'close',
      { name: 'space.new', args: { folder: `${workspaceRoot}/feat-b`, machine: '' } },
    ]);
  });

  test('submitting the branch field runs Grove add', async () => {
    await openDialog();
    typedValue = 'feat/b';

    inputHandlers.get('submit')?.({}, context);
    await settle();

    expect(groveCalls().map((call) => call.args)).toEqual([['add', 'feat/b']]);
  });

  test('a failed Grove add shows its error text and lets the user try again', async () => {
    execResults['grove add feat/b'] = failed("fatal: a branch named 'feat/b' already exists");
    const view = await openDialog();
    typedValue = 'feat/b';

    await click(view, 'Create');

    expect(stateLines).toEqual([
      { kind: 'error', text: "fatal: a branch named 'feat/b' already exists", wrap: true },
    ]);

    expect(calls).toEqual([]);
    expect(buttons.has('Create')).toBe(true);
  });

  test('a long, multi-line Grove add error reaches the dialog whole as wrapping text', async () => {
    const message = [
      `fatal: '${workspaceRoot}/feat-b' could not be created because the folder already exists and is not empty`,
      'hint: remove the folder or pick another branch name',
      'hint: run grove list to see the worktrees of this workspace',
    ].join('\n');

    execResults['grove add feat/b'] = failed(message);
    const view = await openDialog();
    typedValue = 'feat/b';

    await click(view, 'Create');

    expect(stateLines).toEqual([{ kind: 'error', text: message, wrap: true }]);
  });

  test('a new folder Git does not list shows an error and offers no second Grove add', async () => {
    const view = await openDialog();
    typedValue = 'feat/c';

    await click(view, 'Create');

    expect(stateLines.map((line) => line.kind)).toEqual(['error']);
    expect(buttons.has('Create')).toBe(false);
    expect(calls).toEqual([]);
  });

  test('an empty branch runs nothing', async () => {
    const view = await openDialog();

    await click(view, 'Create');

    expect(groveCalls()).toEqual([]);
  });

  test('a new worktree checks no status before the user types a branch', async () => {
    execResults[statusCommand] = failed('fatal: index file corrupt');
    await openDialog();

    expect(stateLines).toEqual([]);
    expect(buttons.has('Create')).toBe(true);
  });

  test('a remote space opens the new worktree on its machine', async () => {
    spaceList = [
      { id: 'space-1', folder: spaceFolderPath, machine: 'box', status: null, tabs: [] },
    ];

    const view = await openDialog();
    typedValue = 'feat/b';

    await click(view, 'Create');

    expect(calls.at(-1)).toEqual({
      name: 'space.new',
      args: { folder: `${workspaceRoot}/feat-b`, machine: 'box' },
    });
  });
});
