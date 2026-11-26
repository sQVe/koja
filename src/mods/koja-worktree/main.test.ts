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
import { closeRiskText, refusedText, riskText } from './dialogText.ts';

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
  close?: () => void;
}

interface ExecGate {
  call: number;
  promise: Promise<void>;
  started: () => void;
}

interface MainModule {
  default: new () => DialogView;
}

interface Reach {
  view: DialogView;
  release: () => void;
}

const workspaceRoot = '/work/repo';

const spaceFolderPath = `${workspaceRoot}/feat-a`;

const statusCommand =
  'git --no-optional-locks status --porcelain --untracked-files=normal --ignore-submodules=none';

const worktreeListCommand = 'git worktree list --porcelain -z';

const layoutCommand =
  'git rev-parse --is-bare-repository --is-inside-git-dir --path-format=absolute --git-dir --git-common-dir';

let checkingNow = false;
let calls: Call[] = [];
let execCalls: ExecCall[] = [];
let execResults: Record<string, ExecResult | Error> = {};
let execQueues: Record<string, ExecResult[]> = {};
let execGates: Record<string, ExecGate> = {};
let execCounts: Record<string, number> = {};
let detailTexts: string[] = [];
let timeline: string[] = [];
let notifications = 0;
let dialogProps: Record<string, unknown> = {};
let spaceList: unknown[] = [];
let spaceStatuses: Record<string, string | null> = {};
let keyDownHandler: KeyHandler | null = null;
let frameOptions: Record<string, unknown> = {};
let buttons = new Map<string, Button>();
let stateLines: StateLine[] = [];
let typedValue = '';
let overlayCloses = 0;
let textFields = 0;
let tasks: Promise<unknown>[] = [];
const inputHandlers = new Map<string, (event: unknown, cx: unknown) => void>();

const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' });

const failed = (stderr: string): ExecResult => ({ code: 1, stdout: '', stderr });

const porcelain = (...fields: string[]): string => `${fields.join('\0')}\0`;

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let settle: (() => void) | null = null;

  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });

  return {
    promise,
    resolve: () => {
      settle?.();
    },
  };
};

const defaultResults = (): Record<string, ExecResult | Error> => ({
  'git rev-parse --show-toplevel': ok(`${spaceFolderPath}\n`),
  [layoutCommand]: ok(
    `false\nfalse\n${workspaceRoot}/.bare/worktrees/feat-a\n${workspaceRoot}/.bare\n`,
  ),
  'git symbolic-ref --quiet --short HEAD': ok('feat/a\n'),
  'git rev-parse --verify --quiet HEAD': ok('1111111\n'),
  [statusCommand]: ok(),
  [worktreeListCommand]: ok(
    porcelain(
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
    ),
  ),
});

const fakeExec = async (
  command: string,
  args: string[] = [],
  options: { cwd?: string; on?: string | null } = {},
): Promise<ExecResult> => {
  execCalls.push({ command, args, cwd: options.cwd, on: options.on });

  const key = [command, ...args].join(' ');
  const count = (execCounts[key] ?? 0) + 1;
  execCounts[key] = count;

  timeline.push(`probe:${key}`);

  if (command === 'grove') {
    timeline.push('grove');
  }

  const gate = execGates[key];

  if (gate?.call === count) {
    gate.started();
    await gate.promise;
  }

  const queued = execQueues[key]?.shift();
  const result = queued ?? execResults[key] ?? ok();

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
  notify: () => {
    notifications += 1;
  },
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
    checking: () => checkingNow,
    exec: fakeExec,
    props: () => dialogProps,
    run: (name: string, args: Record<string, unknown>) => {
      timeline.push(name);
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
    detailText: (text: string) => {
      detailTexts.push(text);

      return chainable();
    },
    dialogButton: recordButton,
    dialogFrame: (options: Record<string, unknown>) => {
      frameOptions = options;

      return dialogFrameFake((handler: KeyHandler) => {
        keyDownHandler = handler;
      });
    },
    recordOf,
    recordOverlayClose: () => {
      overlayCloses += 1;
    },
    rollupStatuses: () => ({ spaces: spaceStatuses, tabs: {} }),
    spaceFolder,
    stateLine: (options: StateLine) => {
      stateLines.push(options);

      return chainable();
    },
    stringOf,
    textField: () => {
      textFields += 1;

      return chainable();
    },
  }),
);

const redraw = (view: DialogView): void => {
  buttons = new Map();
  stateLines = [];
  detailTexts = [];
  view.render();
};

const loadMain = async (path: string): Promise<MainModule> => {
  const loaded: unknown = await import(path);

  return loaded as MainModule;
};

const startDialog = async (): Promise<DialogView> => {
  const loaded = await loadMain('./main.ts');
  const view = new loaded.default();

  view.init(undefined, context);
  view.render();

  return view;
};

const openDialog = async (): Promise<DialogView> => {
  const view = await startDialog();

  await settle();
  redraw(view);

  return view;
};

const hostClose = (view: DialogView): void => {
  timeline.push('dismiss');
  view.close?.();
};

const deliverKey = (key: string): void => {
  if (key === 'escape') {
    timeline.push('dismiss');
  }

  keyDownHandler?.({ key }, context);
};

const deliverEnter = (action: 'remove' | 'new'): void => {
  if (action === 'new') {
    inputHandlers.get('submit')?.({}, context);
  } else {
    keyDownHandler?.({ key: 'enter' }, context);
  }
};

const gateExec = (key: string, call: number): { started: Promise<void>; release: () => void } => {
  const started = deferred();
  const gate = deferred();

  execGates[key] = { call, promise: gate.promise, started: started.resolve };

  return { started: started.promise, release: gate.resolve };
};

const click = async (view: DialogView, label: string): Promise<void> => {
  buttons.get(label)?.click({}, context);
  await settle();
  redraw(view);
};

const groveCalls = (): ExecCall[] => execCalls.filter((call) => call.command === 'grove');

const sentArguments = (): string[][] => groveCalls().map((call) => call.args);

const resetState = (): void => {
  checkingNow = false;
  calls = [];
  execCalls = [];
  execResults = defaultResults();
  execQueues = {};
  execGates = {};
  execCounts = {};
  detailTexts = [];
  timeline = [];
  notifications = 0;
  spaceStatuses = {};
  keyDownHandler = null;
  frameOptions = {};
  buttons = new Map();
  stateLines = [];
  typedValue = '';
  overlayCloses = 0;
  textFields = 0;
  tasks = [];
  inputHandlers.clear();
  dialogProps = { action: 'remove', space: 'space-1', overlay: 'overlay-1' };

  spaceList = [{ id: 'space-1', folder: spaceFolderPath, machine: null, status: null, tabs: [] }];
};

afterAll(() => {
  mock.restore();
});

beforeEach(resetState);

const reachClosing = async (): Promise<Reach> => {
  execResults[statusCommand] = ok(' M src/file.ts\n');
  const gate = gateExec('grove remove --force feat-a', 1);
  const view = await openDialog();

  deliverKey('enter');
  await gate.started;

  spaceStatuses = { 'space-1': 'working' };
  gate.release();
  await settle();
  redraw(view);

  return { view, release: () => undefined };
};

describe('remove worktree', () => {
  test('a remove that asks draws the destructive mark', async () => {
    spaceStatuses = { 'space-1': 'working' };
    await openDialog();

    expect(frameOptions['destructive']).toBe(true);
  });

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

  test('a dirty worktree with a running agent names both risks', async () => {
    execResults[statusCommand] = ok(' M src/file.ts\n');
    spaceStatuses = { 'space-1': 'working' };

    await openDialog();

    expect(detailTexts).toEqual([riskText.changes, riskText.agent]);
    expect(buttons.get('Remove')?.kind).toBe('danger');
  });

  test('a risk that changes before the confirmation asks again and closes nothing', async () => {
    execResults[statusCommand] = ok(' M src/file.ts\n');
    spaceStatuses = { 'space-1': 'working' };
    const view = await openDialog();

    execQueues[statusCommand] = [ok(), ok()];
    spaceStatuses = {};

    await click(view, 'Remove');

    expect(groveCalls()).toEqual([]);
    expect(calls).toEqual([]);
    expect(detailTexts).toEqual([]);
    expect(buttons.get('Remove')?.kind).toBe('danger');

    await click(view, 'Remove');

    expect(groveCalls()).toEqual([
      { command: 'grove', args: ['remove', 'feat-a'], cwd: workspaceRoot, on: null },
    ]);

    expect(calls).toEqual([
      'close',
      { name: 'space.close', args: { id: 'space-1', confirmed: true } },
    ]);
  });

  test('a risk that swaps to another kind asks again', async () => {
    execResults[statusCommand] = ok(' M src/file.ts\n');
    const view = await openDialog();

    execQueues[statusCommand] = [ok()];
    spaceStatuses = { 'space-1': 'working' };

    await click(view, 'Remove');

    expect(groveCalls()).toEqual([]);
    expect(calls).toEqual([]);
    expect(detailTexts.length).toBe(1);
    expect(buttons.get('Remove')?.kind).toBe('danger');
  });

  test('a risk that appears after a clean check asks instead of removing', async () => {
    execQueues[statusCommand] = [ok(), ok(' M src/file.ts\n')];

    await openDialog();

    expect(groveCalls()).toEqual([]);
    expect(calls).toEqual([]);
    expect(detailTexts.length).toBe(1);
    expect(buttons.get('Remove')?.kind).toBe('danger');
  });

  test('the risk read asks for untracked files and no submodule skipping', async () => {
    await openDialog();

    const status = execCalls.find((call) => call.args.includes('status'));

    expect(status?.args).toEqual([
      '--no-optional-locks',
      'status',
      '--porcelain',
      '--untracked-files=normal',
      '--ignore-submodules=none',
    ]);
  });

  test('an agent that starts before the close asks again instead of claiming confirmation', async () => {
    await reachClosing();

    expect(calls).toEqual([]);
    expect(detailTexts).toEqual([closeRiskText.agent]);
    expect(buttons.get('Close')?.kind).toBe('danger');
  });

  test('an agent that stops during the removal closes the space without a second prompt', async () => {
    execResults[statusCommand] = ok(' M src/file.ts\n');
    spaceStatuses = { 'space-1': 'working' };
    const gate = gateExec('grove remove --force feat-a', 1);
    const view = await openDialog();

    deliverKey('enter');
    await gate.started;

    spaceStatuses = {};
    gate.release();
    await settle();
    redraw(view);

    expect(calls).toEqual([
      'close',
      { name: 'space.close', args: { id: 'space-1', confirmed: true } },
    ]);

    expect(detailTexts).toEqual([]);
  });

  test('an agent that stops while the closing question is open closes the space', async () => {
    const { view } = await reachClosing();

    spaceStatuses = {};
    buttons.get('Close')?.click({}, context);
    await settle();
    redraw(view);

    expect(calls).toEqual([
      'close',
      { name: 'space.close', args: { id: 'space-1', confirmed: true } },
    ]);

    expect(detailTexts).toEqual([]);
  });

  test('the closing question closes the space after the user confirms the new agent', async () => {
    const { view } = await reachClosing();

    buttons.get('Close')?.click({}, context);
    await settle();
    redraw(view);

    expect(calls).toEqual([
      'close',
      { name: 'space.close', args: { id: 'space-1', confirmed: true } },
    ]);
  });

  test('an empty shown set never claims confirmation for an agent that appears after Grove', async () => {
    const grove = gateExec('grove remove feat-a', 1);
    const view = await startDialog();

    await grove.started;
    spaceStatuses = { 'space-1': 'working' };
    grove.release();
    await settle();
    redraw(view);

    expect(calls).toEqual([]);
    expect(detailTexts).toEqual([closeRiskText.agent]);
    expect(buttons.get('Close')?.kind).toBe('danger');
  });

  test('cancel at the closing question leaves the space open and the checkout gone', async () => {
    const { view } = await reachClosing();

    buttons.get('Cancel')?.click({}, context);
    await settle();
    redraw(view);

    expect(calls).toEqual(['close']);
    expect(groveCalls()).toHaveLength(1);
  });

  test('escape during the second risk read runs no Grove command', async () => {
    const secondRead = gateExec(statusCommand, 2);
    const view = await startDialog();

    await secondRead.started;
    deliverKey('escape');
    secondRead.release();
    await settle();
    redraw(view);

    expect(groveCalls()).toEqual([]);
    expect(calls).toEqual(['close']);
  });

  test('escape during discovery starts no further Git probe and publishes nothing', async () => {
    const layout = gateExec(layoutCommand, 1);
    const view = await startDialog();

    await layout.started;

    const probes = execCalls.length;
    const notified = notifications;

    deliverKey('escape');
    layout.release();
    await settle();
    redraw(view);

    expect(execCalls.length).toBe(probes);
    expect(notifications).toBe(notified);
    expect(stateLines.filter((line) => line.kind === 'error')).toEqual([]);
  });

  test('a rejected risk read after dismissal publishes no error', async () => {
    execQueues[statusCommand] = [ok(), failed('index is gone')];
    const secondRead = gateExec(statusCommand, 2);
    const view = await startDialog();

    await secondRead.started;

    const notified = notifications;

    deliverKey('escape');
    secondRead.release();
    await settle();
    redraw(view);

    expect(stateLines.filter((line) => line.kind === 'error')).toEqual([]);
    expect(notifications).toBe(notified);
  });

  test('a host close during Grove stops the space close', async () => {
    execResults[statusCommand] = ok(' M src/file.ts\n');
    const grove = gateExec('grove remove --force feat-a', 1);
    const view = await openDialog();

    deliverKey('enter');
    await grove.started;
    hostClose(view);
    grove.release();
    await settle();

    expect(calls).toEqual([]);
    expect(overlayCloses).toBe(1);
  });

  test('enter after a dismissal runs no Grove command', async () => {
    spaceStatuses = { 'space-1': 'working' };
    const view = await openDialog();

    deliverKey('escape');
    deliverKey('enter');
    await settle();
    redraw(view);

    expect(groveCalls()).toEqual([]);
  });

  test('a second Enter after Grove starts runs no second Grove command', async () => {
    execResults[statusCommand] = ok(' M src/file.ts\n');
    const grove = gateExec('grove remove --force feat-a', 1);
    await openDialog();

    deliverKey('enter');
    await grove.started;
    deliverKey('enter');

    grove.release();
    await settle();

    expect(groveCalls()).toEqual([
      { command: 'grove', args: ['remove', '--force', 'feat-a'], cwd: workspaceRoot, on: null },
    ]);
  });

  test('a worktree name that starts with a dash shows an error and runs nothing', async () => {
    execResults['git rev-parse --show-toplevel'] = ok(`${workspaceRoot}/-feat-a\n`);

    execResults[layoutCommand] = ok(
      `false\nfalse\n${workspaceRoot}/.bare/worktrees/-feat-a\n${workspaceRoot}/.bare\n`,
    );

    execResults[statusCommand] = ok(' M src/file.ts\n');
    const view = await openDialog();

    expect(buttons.get('Remove')?.kind).toBe('danger');

    await click(view, 'Remove');

    expect(stateLines).toEqual([
      {
        kind: 'error',
        text: refusedText({ kind: 'refused', name: '-feat-a', role: 'worktree' }),
        wrap: true,
      },
    ]);

    expect(groveCalls()).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('remove worktree without risk', () => {
  test('a clean worktree removes at once and closes the space without a prompt', async () => {
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

    expect(sentArguments()).toEqual([['remove', 'feat-a']]);
  });

  test('an agent-only warning leaves --force off', async () => {
    spaceStatuses = { 'space-1': 'working' };
    const view = await openDialog();

    await click(view, 'Remove');

    expect(sentArguments()).toEqual([['remove', 'feat-a']]);
  });

  test('enter confirms a remove that asks first', async () => {
    spaceStatuses = { 'space-1': 'working' };
    await openDialog();

    deliverKey('enter');
    await settle();

    expect(sentArguments()).toEqual([['remove', 'feat-a']]);
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

    expect(execCalls.length).toBeGreaterThan(0);
    expect(execCalls.every((call) => call.on === 'box')).toBe(true);
  });
});

describe('worktree checks', () => {
  test('a folder outside any repository shows an error and runs no Grove', async () => {
    execResults[layoutCommand] = failed('fatal: not a git repository');
    await openDialog();

    expect(stateLines).toEqual([
      { kind: 'error', text: `${spaceFolderPath} is not in a git repository.`, wrap: true },
    ]);

    expect(groveCalls()).toEqual([]);
    expect(calls).toEqual([]);
  });

  test('a bare repository shows an error and runs no Grove', async () => {
    execResults[layoutCommand] = ok(`true\ntrue\n${spaceFolderPath}\n${spaceFolderPath}\n`);
    await openDialog();

    expect(stateLines).toEqual([
      {
        kind: 'error',
        text: `${spaceFolderPath} is a bare repository with no checkout.`,
        wrap: true,
      },
    ]);

    expect(groveCalls()).toEqual([]);
    expect(calls).toEqual([]);
  });

  test('a failed git status shows its error and runs no Grove', async () => {
    execResults[statusCommand] = failed('fatal: index file corrupt');
    await openDialog();

    expect(stateLines).toEqual([{ kind: 'error', text: 'fatal: index file corrupt', wrap: true }]);
    expect(buttons.has('Remove')).toBe(false);
    expect(groveCalls()).toEqual([]);
  });

  test('a folder outside a Grove workspace shows an error and runs no Grove', async () => {
    execResults[layoutCommand] = ok(
      `false\nfalse\n${spaceFolderPath}/.git\n${spaceFolderPath}/.git\n`,
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

  test('during herdr-app check, a clean worktree runs no git or Grove and keeps its space', async () => {
    checkingNow = true;
    await openDialog();

    expect(execCalls).toEqual([]);
    expect(calls).toEqual([]);
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

    deliverKey('escape');
    await settle();

    expect(calls).toEqual(['close']);
    expect(groveCalls()).toEqual([]);
  });

  test('escape while the check is pending runs no Grove command', async () => {
    const read = gateExec(statusCommand, 1);
    const view = await startDialog();

    await read.started;
    deliverKey('escape');
    read.release();
    await settle();
    redraw(view);

    expect(groveCalls()).toEqual([]);
    expect(calls).toEqual(['close']);
  });
});

describe('new worktree', () => {
  beforeEach(() => {
    dialogProps = { action: 'new', space: 'space-1', overlay: 'overlay-1' };
  });

  test('a new worktree draws no destructive mark', async () => {
    await openDialog();

    expect(frameOptions['destructive']).toBe(false);
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

    const addArguments = groveCalls().map((call) => call.args);

    expect(addArguments).toEqual([['add', 'feat/b']]);
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

  test('a new folder Git does not list offers a lookup retry that runs no second Grove add', async () => {
    const view = await openDialog();
    typedValue = 'feat/c';

    await click(view, 'Create');

    expect(stateLines.map((line) => line.kind)).toEqual(['error']);
    expect(buttons.has('Create')).toBe(false);
    expect(buttons.has('Find folder')).toBe(true);
    expect(calls).toEqual([]);

    execResults[worktreeListCommand] = ok(
      porcelain(
        `worktree ${workspaceRoot}/.bare`,
        'bare',
        '',
        `worktree ${spaceFolderPath}`,
        'HEAD 1111111',
        'branch refs/heads/feat/a',
        '',
        `worktree ${workspaceRoot}/feat-c`,
        'HEAD 2222222',
        'branch refs/heads/feat/c',
        '',
      ),
    );

    await click(view, 'Find folder');

    expect(groveCalls()).toEqual([
      { command: 'grove', args: ['add', 'feat/c'], cwd: workspaceRoot, on: null },
    ]);

    expect(calls.at(-1)).toEqual({
      name: 'space.new',
      args: { folder: `${workspaceRoot}/feat-c`, machine: '' },
    });
  });

  test('escape during the folder lookup opens no space', async () => {
    const lookup = gateExec(worktreeListCommand, 1);
    const view = await openDialog();
    typedValue = 'feat/b';

    deliverEnter('new');
    await lookup.started;
    deliverKey('escape');
    lookup.release();
    await settle();
    redraw(view);

    expect(groveCalls()).toEqual([
      { command: 'grove', args: ['add', 'feat/b'], cwd: workspaceRoot, on: null },
    ]);

    expect(calls).toEqual(['close']);
  });

  test('escape during the retried lookup opens no space', async () => {
    const view = await openDialog();
    typedValue = 'feat/c';

    await click(view, 'Create');

    expect(buttons.has('Find folder')).toBe(true);

    execResults[worktreeListCommand] = ok(
      porcelain(
        `worktree ${workspaceRoot}/.bare`,
        'bare',
        '',
        `worktree ${spaceFolderPath}`,
        'HEAD 1111111',
        'branch refs/heads/feat/a',
        '',
        `worktree ${workspaceRoot}/feat-c`,
        'HEAD 2222222',
        'branch refs/heads/feat/c',
        '',
      ),
    );

    const lookup = gateExec(worktreeListCommand, 2);
    buttons.get('Find folder')?.click({}, context);
    await lookup.started;
    deliverKey('escape');
    lookup.release();
    await settle();
    redraw(view);

    expect(groveCalls()).toEqual([
      { command: 'grove', args: ['add', 'feat/c'], cwd: workspaceRoot, on: null },
    ]);

    expect(calls).toEqual(['close']);
  });

  test('the folder lookup retry shows no branch field', async () => {
    const view = await openDialog();
    typedValue = 'feat/c';

    await click(view, 'Create');

    textFields = 0;
    redraw(view);

    expect(buttons.has('Find folder')).toBe(true);
    expect(textFields).toBe(0);
  });

  test('a lookup that cannot run offers the same lookup-only retry', async () => {
    const view = await openDialog();
    typedValue = 'feat/c';
    execResults[worktreeListCommand] = new Error('git is gone');

    await click(view, 'Create');

    expect(stateLines).toEqual([{ kind: 'error', text: 'git is gone', wrap: true }]);
    expect(buttons.has('Find folder')).toBe(true);
    expect(calls).toEqual([]);
  });

  test('the folder lookup lists worktrees in NUL-separated porcelain', async () => {
    const view = await openDialog();
    typedValue = 'feat/b';

    await click(view, 'Create');

    const listing = execCalls.find((call) => call.args[0] === 'worktree');

    expect(listing?.args).toEqual(['worktree', 'list', '--porcelain', '-z']);
  });

  test('a branch that starts with a dash shows an error and runs no Grove', async () => {
    const view = await openDialog();
    typedValue = '-x';

    await click(view, 'Create');

    expect(stateLines).toEqual([
      {
        kind: 'error',
        text: refusedText({ kind: 'refused', name: '-x', role: 'branch' }),
        wrap: true,
      },
    ]);

    expect(groveCalls()).toEqual([]);
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

const eventOrders = (length: number): string[][] => {
  const events = ['escape', 'enter', 'close', 'release'];

  if (length === 0) {
    return [[]];
  }

  return eventOrders(length - 1).flatMap((order) => events.map((event) => order.concat(event)));
};

const isEffect = (event: string): boolean =>
  event === 'grove' || event === 'space.new' || event === 'space.close';

const isProbe = (event: string): boolean => event.startsWith('probe:');

const commandAfterDismissal = (events: string[]): boolean => {
  const dismissedAt = events.indexOf('dismiss');

  if (dismissedAt === -1) {
    return false;
  }

  const after = events.slice(dismissedAt + 1);

  return after.some((event) => isProbe(event) || isEffect(event));
};

const reachDiscovery = async (): Promise<Reach> => {
  const gate = gateExec(layoutCommand, 1);
  const view = await startDialog();

  await gate.started;

  return { view, release: gate.release };
};

const reachFirstRisk = async (): Promise<Reach> => {
  const gate = gateExec(statusCommand, 1);
  const view = await startDialog();

  await gate.started;

  return { view, release: gate.release };
};

const reachSecondRisk = async (): Promise<Reach> => {
  const gate = gateExec(statusCommand, 2);
  const view = await startDialog();

  await gate.started;

  return { view, release: gate.release };
};

const reachGroveRemove = async (): Promise<Reach> => {
  execResults[statusCommand] = ok(' M src/file.ts\n');
  const gate = gateExec('grove remove --force feat-a', 1);
  const view = await openDialog();

  deliverKey('enter');
  await gate.started;

  return { view, release: gate.release };
};

const reachGroveAdd = async (): Promise<Reach> => {
  dialogProps = { action: 'new', space: 'space-1', overlay: 'overlay-1' };
  typedValue = 'feat/b';
  const gate = gateExec('grove add feat/b', 1);
  const view = await openDialog();

  deliverEnter('new');
  await gate.started;

  return { view, release: gate.release };
};

const reachLookup = async (): Promise<Reach> => {
  dialogProps = { action: 'new', space: 'space-1', overlay: 'overlay-1' };
  typedValue = 'feat/b';
  const gate = gateExec(worktreeListCommand, 1);
  const view = await openDialog();

  deliverEnter('new');
  await gate.started;

  return { view, release: gate.release };
};

const reaches: { name: string; reach: () => Promise<Reach> }[] = [
  { name: 'discovery', reach: reachDiscovery },
  { name: 'first risk read', reach: reachFirstRisk },
  { name: 'second risk read', reach: reachSecondRisk },
  { name: 'Grove remove', reach: reachGroveRemove },
  { name: 'Grove add', reach: reachGroveAdd },
  { name: 'folder lookup', reach: reachLookup },
  { name: 'closing question', reach: reachClosing },
];

describe('dismissal', () => {
  test('no command follows a dismissal from any reachable pending phase', async () => {
    const orders = [0, 1, 2].flatMap((length) => eventOrders(length));

    for (const { name, reach } of reaches) {
      for (const order of orders) {
        resetState();

        const { view, release } = await reach();

        for (const event of order) {
          if (event === 'escape') {
            deliverKey('escape');
          } else if (event === 'enter') {
            const action = name === 'Grove add' || name === 'folder lookup' ? 'new' : 'remove';
            deliverEnter(action);
          } else if (event === 'close') {
            hostClose(view);
          } else {
            release();
          }
        }

        release();
        await settle();

        if (commandAfterDismissal(timeline)) {
          throw new Error(
            `${name} ${order.join('>')} dispatched a command after dismissal: ${timeline.join(',')}`,
          );
        }
      }
    }
  });
});
