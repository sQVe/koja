import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  setSystemTime,
  test,
} from 'bun:test';

import { gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

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

const tab: NormalKeyEvent = { key: 'tab', keystroke: 'tab', modifiers: noModifiers };

const shiftTab: NormalKeyEvent = {
  key: 'tab',
  keystroke: 'shift-tab',
  modifiers: { ...noModifiers, shift: true },
};

let focusedPane: string | null = 'p1';
let focusedTab = 'tab-1';
let runCalls: RunCall[] = [];
let askFirstCalls: RunCall[] = [];
let askFirstOpensDialog = false;
let closeCalls: (string | null)[] = [];
let focusCalls = 0;
let overlayFocused = false;
let terminalKeys: string[] = [];
let afterHandlers: (() => void)[] = [];
let statusLookups = 0;
let paletteOpen = false;
let helpOpen = false;
let keyDownHandler: ((event: unknown) => void) | null = null;
let keyBindings: { keystroke: string; action: string; context?: string }[] = [];
let keyContext: string | null = null;
let actionHandlers: Record<string, () => void> = {};
let currentContext: unknown = null;
let sharedValues: Record<string, unknown> = {};
let sharedWrites: string[] = [];
let tickHandler: (() => void) | null = null;
let sidebarHidden = false;
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

  element['on_key_down'] = (handler: (event: unknown, cx: unknown) => void) => {
    keyDownHandler = (event) => {
      handler(event, currentContext);
    };

    return element;
  };

  element['key_context'] = (context: string) => {
    keyContext = context;

    return element;
  };

  element['on_action'] = (action: string, handler: (event: unknown, cx: unknown) => void) => {
    actionHandlers[action] = () => {
      handler({ action }, currentContext);
    };

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

const press = (event: NormalKeyEvent): void => {
  if (!overlayFocused) {
    terminalKeys.push(event.keystroke);

    return;
  }

  keyDownHandler?.(event);
};

const pressBound = (keystroke: string): void => {
  const binding = keyBindings.find(
    (candidate) => candidate.keystroke === keystroke && candidate.context === keyContext,
  );

  if (binding !== undefined && overlayFocused) {
    actionHandlers[binding.action]?.();
  }
};

const runAfterHandlers = (): void => {
  const handlers = afterHandlers;

  afterHandlers = [];

  for (const handler of handlers) {
    handler();
  }
};

await mock.module('gpui-kit', () => gpuiKitFake({ div: createElement, View: HostView }));

await mock.module('herdr', () =>
  herdrFake({
    exec: async () => {
      statusLookups += 1;

      const overlays = [];

      if (paletteOpen) {
        overlays.push({ name: 'koja-palette' });
      }

      if (helpOpen) {
        overlays.push({ name: 'help' });
      }

      return { code: 0, stdout: JSON.stringify({ overlays }), stderr: '' };
    },
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
      sharedWrites.push(key);

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => [],
  }),
);

const { overlayCloseCount, recordOverlayClose } = await import('../../kit/overlayOpen.ts');
const { readSection, shownSections, writeSection } = await import('../../kit/section.ts');

const markedSection = (): string => readSection((key) => sharedValues[key]);

const markSidebar = (): void => {
  writeSection((key, value) => {
    sharedValues[key] = value;
  }, 'sidebar');
};

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    askFirst: (command: string, args?: Record<string, unknown>) => {
      askFirstCalls.push({ command, args });

      if (command !== 'tab.close') {
        runCalls.push({ command, args });
      }

      return askFirstOpensDialog;
    },
    closeOverlay: (id?: string | null) => {
      closeCalls.push(id ?? null);
    },
    findLayoutNode: (id: string) => ({ id, hidden: sidebarHidden }),
    overlayCloseCount,
    shownSections,
    modName: 'koja-modal',
    overlayId: () => 'overlay-1',
    repeat: (_cx: unknown, _milliseconds: number, handler: () => void) => {
      tickHandler = handler;
    },
  }),
);

const loadView = async (): Promise<FakeView> => {
  const modulePath = './main.ts';
  const loaded = (await import(modulePath)) as { default: new () => FakeView };
  const view = new loaded.default();

  const context = {
    focus_handle: () => ({
      focus: () => {
        focusCalls += 1;
        overlayFocused = true;
      },
      is_focused: () => overlayFocused,
      release: () => true,
    }),
    bind_keys: (bindings: typeof keyBindings) => {
      keyBindings.push(...bindings);

      return bindings.length;
    },
    spawn: (body: () => Promise<void>) => {
      body().catch(() => undefined);
    },
    stop_propagation: () => {},
    timer: {
      every: () => {},
      after: (_milliseconds: number, handler: (cx: unknown) => void) => {
        afterHandlers.push(() => {
          handler(undefined);
        });
      },
    },
  };

  view.init(undefined, context);

  currentContext = context;

  return view;
};

afterAll(() => {
  mock.restore();
});

afterEach(() => {
  setSystemTime();
});

beforeEach(() => {
  focusedPane = 'p1';
  focusedTab = 'tab-1';
  runCalls = [];
  askFirstCalls = [];
  askFirstOpensDialog = false;
  closeCalls = [];
  focusCalls = 0;
  overlayFocused = false;
  terminalKeys = [];
  afterHandlers = [];
  statusLookups = 0;
  paletteOpen = false;
  helpOpen = false;
  keyDownHandler = null;
  keyBindings = [];
  keyContext = null;
  actionHandlers = {};
  currentContext = null;
  sharedValues = {};
  sharedWrites = [];
  tickHandler = null;
  sidebarHidden = false;
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

    keyDownHandler?.(plain('t'));
    keyDownHandler?.(plain('n'));

    expect(runCalls).toEqual([{ command: 'tab.new', args: undefined }]);
  });

  test('i closes the overlay', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(plain('i'));

    expect(closeCalls).toEqual(['overlay-1']);
  });

  test('after ctrl-w w, the next key reaches normal mode and no status lookup runs', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(control('w', 'ctrl-w'));
    keyDownHandler?.(plain('w'));

    // The host applies the pane move after the handler, so the pane owns the keyboard.
    overlayFocused = false;

    runAfterHandlers();

    press(plain('i'));

    expect(terminalKeys).toEqual([]);
    expect(closeCalls).toEqual(['overlay-1']);
    expect(statusLookups).toBe(0);
  });

  test('yielding to a palette opened before a pending regain keeps the palette in front', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(control('w', 'ctrl-w'));
    keyDownHandler?.(plain('w'));

    paletteOpen = true;
    overlayFocused = false;

    keyDownHandler?.(plain('backspace'));

    const focusBefore = focusCalls;

    runAfterHandlers();
    await flush();

    expect(focusCalls).toBe(focusBefore);
    expect(overlayFocused).toBe(false);
  });

  test('/ opens the search and closes normal mode so typing goes to the find bar', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(plain('/'));
    overlayFocused = false;
    runAfterHandlers();
    await flush();

    expect(runCalls).toEqual([{ command: 'terminal.search', args: undefined }]);
    expect(closeCalls).toEqual(['overlay-1']);
    expect(overlayFocused).toBe(false);
  });

  test('? leaves the keyboard with Help while it is open', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(plain('?'));
    overlayFocused = false;
    helpOpen = true;
    runAfterHandlers();
    tickHandler?.();
    await flush();
    tickHandler?.();
    await flush();

    expect(runCalls).toEqual([{ command: 'mod.open', args: { name: 'koja-help' } }]);
    expect(overlayFocused).toBe(false);
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

  test('ctrl-w p returns to the pane before a focus change made outside normal mode keys', async () => {
    const view = await loadView();

    view.render();
    focusedPane = 'p2';
    tickHandler?.();
    focusedPane = 'p3';
    tickHandler?.();
    runCalls = [];

    keyDownHandler?.(control('w', 'ctrl-w'));
    keyDownHandler?.(plain('p'));

    expect(runCalls).toEqual([{ command: 'pane.focus', args: { pane: 'p2' } }]);
  });

  test('a tick with unchanged focus writes no shared state', async () => {
    await loadView();

    expect(tickHandler).not.toBeNull();

    sharedWrites = [];
    tickHandler?.();

    expect(sharedWrites).toEqual([]);
  });

  test('takes the keyboard back on the first tick after the palette closes, inside the backoff', async () => {
    setSystemTime(0);
    const view = await loadView();

    view.render();
    overlayFocused = false;
    paletteOpen = true;

    tickHandler?.();
    await flush();

    paletteOpen = false;
    recordOverlayClose();
    tickHandler?.();
    await flush();

    // The first lookup after the close is confirmed by a second one before focus moves.
    expect(statusLookups).toBe(3);
    expect(overlayFocused).toBe(true);
  });

  test('keeps the keyboard with the palette when the status still lists it after the shared state closes', async () => {
    setSystemTime(0);
    const view = await loadView();

    view.render();
    overlayFocused = false;
    paletteOpen = true;

    tickHandler?.();
    await flush();

    recordOverlayClose();
    tickHandler?.();
    await flush();

    expect(statusLookups).toBe(2);
    expect(overlayFocused).toBe(false);
  });

  test('takes the keyboard back on the first tick after the last of two overlays closes, after the backoff capped', async () => {
    setSystemTime(0);
    const view = await loadView();

    view.render();
    overlayFocused = false;
    paletteOpen = true;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      tickHandler?.();
      await flush();
      setSystemTime(Date.now() + 1000);
    }

    recordOverlayClose();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      tickHandler?.();
      await flush();
      setSystemTime(Date.now() + 1000);
    }

    tickHandler?.();
    await flush();

    paletteOpen = false;
    recordOverlayClose();

    const lookupsBeforeLastClose = statusLookups;

    tickHandler?.();

    expect(statusLookups).toBe(lookupsBeforeLastClose + 1);
  });

  test('a close count left from an earlier session does not delay the lookup after the next close', async () => {
    setSystemTime(0);
    recordOverlayClose();
    recordOverlayClose();
    const view = await loadView();

    view.render();
    overlayFocused = false;
    paletteOpen = true;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      tickHandler?.();
      await flush();
      setSystemTime(Date.now() + 1000);
    }

    tickHandler?.();
    await flush();

    paletteOpen = false;
    recordOverlayClose();

    const lookupsBeforeClose = statusLookups;

    tickHandler?.();

    expect(overlayCloseCount()).toBe(3);
    expect(statusLookups).toBe(lookupsBeforeClose + 1);
  });

  test('the hold command scrolls the terminal a page up like ctrl-b', async () => {
    const view = await loadView();

    view.render();

    const focusBefore = focusCalls;

    overlayFocused = false;
    deliverCommand('hold');
    await flush();

    expect(runCalls).toEqual([{ command: 'terminal.scroll', args: { pages: -1 } }]);
    expect(closeCalls).toEqual([]);
    expect(focusCalls).toBe(focusBefore + 1);
  });

  test('an unknown command does nothing', async () => {
    const view = await loadView();

    view.render();

    deliverCommand('other');
    await flush();

    expect(runCalls).toEqual([]);
    expect(closeCalls).toEqual([]);
  });

  test('3gt selects the third tab', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(plain('3'));
    keyDownHandler?.(plain('g'));
    keyDownHandler?.(plain('t'));

    expect(runCalls).toEqual([{ command: 'tab.select', args: { index: 3 } }]);
  });

  test('t q routes tab.close through askFirst instead of Herdr run', async () => {
    const view = await loadView();

    view.render();

    keyDownHandler?.(plain('t'));
    keyDownHandler?.(plain('q'));

    expect(askFirstCalls).toEqual([{ command: 'tab.close', args: undefined }]);
    expect(runCalls).toEqual([]);
  });

  test('t q yields the keyboard so the confirm keeps focus', async () => {
    const view = await loadView();

    view.render();

    askFirstOpensDialog = true;
    paletteOpen = true;
    overlayFocused = false;

    keyDownHandler?.(plain('t'));
    keyDownHandler?.(plain('q'));
    runAfterHandlers();

    expect(overlayFocused).toBe(false);
  });

  test('t q regains the keyboard at once when no dialog opens', async () => {
    const view = await loadView();

    view.render();

    askFirstOpensDialog = false;
    paletteOpen = false;
    overlayFocused = false;

    const focusBefore = focusCalls;

    keyDownHandler?.(plain('t'));
    keyDownHandler?.(plain('q'));
    runAfterHandlers();

    expect(overlayFocused).toBe(true);
    expect(focusCalls).toBe(focusBefore + 1);
    expect(statusLookups).toBe(0);
  });

  test('the tab key that the mod binds marks the sidebar, and the next one marks panes', async () => {
    const view = await loadView();

    view.render();
    pressBound('tab');

    const afterFirst = markedSection();

    pressBound('tab');

    expect([afterFirst, markedSection()]).toEqual(['sidebar', 'panes']);
    expect(closeCalls).toEqual([]);
  });

  test('the shift-tab key that the mod binds marks the sidebar from panes', async () => {
    const view = await loadView();

    view.render();
    pressBound('shift-tab');

    expect(markedSection()).toBe('sidebar');
  });

  test('tab marks the sidebar and the next tab marks panes', async () => {
    const view = await loadView();

    view.render();
    press(tab);

    const afterFirst = markedSection();

    press(tab);

    expect([afterFirst, markedSection()]).toEqual(['sidebar', 'panes']);
    expect(closeCalls).toEqual([]);
  });

  test('shift-tab marks the sidebar', async () => {
    const view = await loadView();

    view.render();
    press(shiftTab);

    expect(markedSection()).toBe('sidebar');
  });

  test('with the sidebar marked, j runs the sidebar list command without askFirst', async () => {
    const view = await loadView();

    view.render();
    press(tab);
    press(plain('j'));

    expect(runCalls).toEqual([{ command: 'koja-spaces.list-down', args: undefined }]);
    expect(askFirstCalls).toEqual([]);
  });

  test('with the sidebar marked, enter opens the row and stays in normal mode', async () => {
    const view = await loadView();

    view.render();
    press(tab);
    press({ key: 'enter', keystroke: 'enter', modifiers: noModifiers });

    expect(runCalls).toEqual([{ command: 'koja-spaces.list-open', args: undefined }]);
    expect(closeCalls).toEqual([]);
  });

  test('with the sidebar marked, i leaves normal mode and drops the mark', async () => {
    const view = await loadView();

    view.render();
    press(tab);
    press(plain('i'));

    expect(closeCalls).toEqual(['overlay-1']);
    expect(markedSection()).toBe('panes');
  });

  test('a tick drops the mark of a sidebar that hid', async () => {
    const view = await loadView();

    view.render();
    press(tab);
    const beforeHide = markedSection();

    sidebarHidden = true;
    tickHandler?.();

    expect([beforeHide, markedSection()]).toEqual(['sidebar', 'panes']);
  });

  test('no key goes to a sidebar that hid before the tick', async () => {
    const view = await loadView();

    view.render();
    press(tab);
    sidebarHidden = true;
    press(plain('j'));

    expect(runCalls).toEqual([{ command: 'pane.go', args: { direction: 'down' } }]);
  });

  test('a mark left by an earlier session is dropped on start', async () => {
    markSidebar();

    await loadView();

    expect(markedSection()).toBe('panes');
  });

  test('closing drops the mark', async () => {
    const view = await loadView();

    markSidebar();
    view.close();

    expect(markedSection()).toBe('panes');
  });
});
