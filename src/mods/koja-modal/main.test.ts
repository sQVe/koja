import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

interface KeyModifiers {
  shift: boolean;
  control: boolean;
  alt: boolean;
  platform: boolean;
  function: boolean;
}

interface NormalKeyEvent {
  key: string;
  keystroke: string;
  key_char?: string;
  modifiers: KeyModifiers;
}

interface FakeView {
  init: (props: unknown, cx: unknown) => void;
  render: () => unknown;
  close: () => void;
}

const noModifiers: KeyModifiers = {
  shift: false,
  control: false,
  alt: false,
  platform: false,
  function: false,
};

const control = (key: string, keystroke: string): NormalKeyEvent => ({
  key,
  keystroke,
  key_char: key,
  modifiers: { ...noModifiers, control: true },
});

const plain = (key: string): NormalKeyEvent => ({
  key,
  keystroke: key,
  key_char: key,
  modifiers: noModifiers,
});

let focusedPane: string | null = 'p1';
let focusedTab = 'tab-1';
let runCalls: RunCall[] = [];
let closeCalls: (string | null)[] = [];
let focusCalls = 0;
let keyDownHandler: ((event: unknown) => void) | null = null;
let sharedValues: Record<string, unknown> = {};
const commandQueue: string[] = [];
const commandWaiters: ((command: string) => void)[] = [];

const nextCommand = (): Promise<string> => {
  const queued = commandQueue.shift();

  if (queued !== undefined) {
    return Promise.resolve(queued);
  }

  return new Promise((resolve) => {
    commandWaiters.push(resolve);
  });
};

const deliverCommand = (command: string): void => {
  const waiter = commandWaiters.shift();

  if (waiter !== undefined) {
    waiter(command);

    return;
  }

  commandQueue.push(command);
};

const createElement = (): Record<string, unknown> => {
  const element: Record<string, unknown> = {};

  element['id'] = () => element;
  element['size_full'] = () => element;

  element['on_key_down'] = (handler: (event: unknown) => void) => {
    keyDownHandler = handler;

    return element;
  };

  element['on_mouse_down'] = () => element;
  element['track_focus'] = () => element;

  return element;
};

const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

class HostView {
  render(): unknown {
    return null;
  }
}

await mock.module('gpui-kit', () => ({
  div: createElement,
  View: HostView,
}));

await mock.module('herdr', () => ({
  exec: async () => ({ code: 0, stdout: '{"overlays":[]}', stderr: '' }),
  focused: () => ({
    space: 'space-1',
    tab: focusedTab,
    pane: focusedPane,
    terminal: null,
    shown: null,
    agent: null,
    cwd: null,
  }),
  nextCommand,
  panes: () => [
    { pane: 'p1', tab: 'tab-1' },
    { pane: 'p2', tab: 'tab-1' },
    { pane: 'p3', tab: 'tab-1' },
  ],
  run: (command: string, args?: Record<string, unknown>) => {
    runCalls.push({ command, args });

    return null;
  },
  setShared: (key: string, value: unknown) => {
    sharedValues[key] = value;

    return null;
  },
  shared: (key: string) => sharedValues[key],
}));

await mock.module('../../kit/index.ts', () => ({
  closeOverlay: (id?: string | null) => {
    closeCalls.push(id ?? null);
  },
  modName: 'koja-modal',
  overlayId: () => 'overlay-1',
  repeat: (_cx: unknown, _milliseconds: number, _handler: () => void) => {},
}));

const loadView = async (): Promise<FakeView> => {
  const modulePath = './main.ts';
  const loaded = (await import(modulePath)) as { default: new () => FakeView };
  const view = new loaded.default();

  const context = {
    focus_handle: () => ({
      focus: () => {
        focusCalls += 1;
      },
      is_focused: () => false,
      release: () => true,
    }),
    spawn: (body: () => Promise<void>) => {
      body().catch(() => undefined);
    },
    stop_propagation: () => {},
    timer: { every: () => {} },
  };

  view.init(undefined, context);

  return view;
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  focusedPane = 'p1';
  focusedTab = 'tab-1';
  runCalls = [];
  closeCalls = [];
  focusCalls = 0;
  keyDownHandler = null;
  sharedValues = {};
  commandQueue.length = 0;
  commandWaiters.length = 0;
});

describe('koja modal view', () => {
  test('a prefix key runs nothing', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(control('w', 'ctrl-w'));

    expect(runCalls).toEqual([]);
  });

  test('a completed sequence runs its command', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(control('t', 'ctrl-t'));
    keyDownHandler?.(plain('n'));

    expect(runCalls).toEqual([{ command: 'tab.next', args: undefined }]);
  });

  test('i closes the overlay', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(plain('i'));

    expect(closeCalls).toEqual(['overlay-1']);
  });

  test('closing with no focused pane issues no pane.focus', async () => {
    const view = await loadView();

    focusedPane = null;
    runCalls = [];

    view.close();

    expect(sharedValues['koja-modal']).toBeNull();
    expect(runCalls).toEqual([]);
  });

  test('ctrl-w p returns to the pane left last, after a focus change outside normal mode', async () => {
    const first = await loadView();

    focusedPane = 'p2';
    first.close();
    focusedPane = 'p3';

    const second = await loadView();

    second.render();
    runCalls = [];

    keyDownHandler?.(control('w', 'ctrl-w'));
    keyDownHandler?.(plain('p'));

    expect(runCalls).toEqual([{ command: 'pane.focus', args: { pane: 'p2' } }]);
  });

  test('the hold command neither closes nor runs anything', async () => {
    const view = await loadView();

    view.render();

    const focusBefore = focusCalls;

    deliverCommand('hold');
    await flush();

    expect(runCalls).toEqual([]);
    expect(closeCalls).toEqual([]);
    expect(focusCalls).toBe(focusBefore + 1);
  });
});
