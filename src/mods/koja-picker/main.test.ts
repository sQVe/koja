import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

type KeyHandler = (event: { key: string; modifiers: { control: boolean } }, cx: unknown) => void;

// The build defines this global for each mod; the picker's preview code reads it at load time.
Object.assign(globalThis, { kojaModName: 'koja-picker' });

let keyDownHandler: KeyHandler | null = null;
let closeOverlayCalls = 0;
let props: Record<string, unknown> = {};
let sharedValues: Record<string, unknown> = {};
let sharedWrites: string[] = [];
let keyBindings: { keystroke: string; action: string; context?: string }[] = [];
let keyContext: string | null = null;
let actionHandlers: Record<string, () => void> = {};
let emptyText = '';

const chainable = (onKeyDown?: (handler: KeyHandler) => void): unknown => {
  const element: unknown = new Proxy(() => element, {
    get: (_target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key === 'key_context') {
        return (context: string) => {
          keyContext = context;

          return element;
        };
      }

      if (key === 'on_action') {
        return (action: string, handler: (event: unknown, cx: unknown) => void) => {
          actionHandlers[action] = () => {
            handler({ action }, renderedContext);
          };

          return element;
        };
      }

      if (key === 'on_key_down') {
        return (handler: KeyHandler) => {
          onKeyDown?.(handler);

          return element;
        };
      }

      return element;
    },
    apply: () => element,
  });

  return element;
};

const inputStub = {
  on: () => undefined,
  focus: () => undefined,
  value: () => '',
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: () => chainable(),
    InputState: { new: () => inputStub },
    v_flex: () =>
      chainable((handler) => {
        keyDownHandler = handler;
      }),
    v_virtual_list: () => chainable(),
    VirtualListScrollHandle: { new: () => chainable() },
  }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({
    div: () => chainable(),
    View: class {
      render(): unknown {
        return null;
      }
    },
  }),
);

await mock.module('herdr', () =>
  herdrFake({
    appHome: () => '/tmp',
    exec: async () => ({ code: 0, stdout: '', stderr: '' }),
    focused: () => null,
    hc: () => null,
    nextCommand: () => new Promise<string>(() => {}),
    panes: () => [],
    props: () => props,
    readTextFile: () => '',
    run: () => null,
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;
      sharedWrites.push(key);

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => [],
    terminals: () => [],
    writeTextFile: () => null,
  }),
);

const { overlayCloseCount, recordOverlayClose } = await import('../../kit/overlayOpen.ts');

const { recordOf, stringOf } = await import('../../kit/fields.ts');

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    recordOverlayClose,
    closeOverlay: () => {
      closeOverlayCalls += 1;
    },
    colors: () => chainable(),
    highlightedText: () => chainable(),
    icon: () => chainable(),
    iconSlot: () => chainable(),
    listRow: () => chainable(),
    modName: 'koja-picker',
    openAtTop: () => 'overlay-3',
    overlayId: () => null,
    overlaySize: {},
    programIcon: () => chainable(),
    radius: {},
    recordOf,
    repeat: () => undefined,
    rollupStatuses: () => ({ spaces: {}, tabs: {} }),
    rowHeight: {},
    searchField: () => chainable(),
    spacing: {},
    stateLine: (state: { text: string }) => {
      emptyText = state.text;

      return chainable();
    },
    statusMark: () => chainable(),
    stringOf,
    textSize: {},
    toggleButton: () => chainable(),
    withTextRole: (element: unknown) => element,
  }),
);

const loadView = async (): Promise<{
  init: (props: unknown, cx: unknown) => void;
  render: () => unknown;
  close: () => void;
}> => {
  const modulePath = './main.ts';

  const loaded = (await import(modulePath)) as {
    default: new () => {
      init: (props: unknown, cx: unknown) => void;
      render: () => unknown;
      close: () => void;
    };
  };

  return new loaded.default();
};

const asyncContext = {
  bind_keys: (bindings: typeof keyBindings) => {
    keyBindings.push(...bindings);

    return bindings.length;
  },
  focus_handle: () => ({ focus: () => undefined, is_focused: () => false }),
  spawn: () => undefined,
  timer: { after: () => undefined, every: () => undefined },
};

const renderedContext = {
  notify: () => undefined,
  stop_propagation: () => undefined,
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  keyDownHandler = null;
  closeOverlayCalls = 0;
  props = { part: 'list' };
  sharedValues = {};
  sharedWrites = [];
  keyBindings = [];
  keyContext = null;
  actionHandlers = {};
  emptyText = '';
});

describe('picker overlay state', () => {
  test('installed tab actions cycle the status filter in the picker context', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    expect(keyBindings.map((binding) => binding.keystroke)).toEqual(['tab', 'shift-tab']);
    expect(keyContext).toBe('KojaPicker');
    expect(emptyText).toBe('No space matches.');

    const steps = [
      { keystroke: 'tab', expected: 'Nothing needs you.' },
      { keystroke: 'shift-tab', expected: 'No space matches.' },
      { keystroke: 'shift-tab', expected: 'Nothing is idle.' },
    ];

    for (const { keystroke, expected } of steps) {
      const binding = keyBindings.find((entry) => entry.keystroke === keystroke);

      expect(binding?.context).toBe(keyContext ?? undefined);
      actionHandlers[binding?.action ?? '']?.();
      view.render();

      expect(emptyText).toBe(expected);
    }

    keyDownHandler?.({ key: 'escape', modifiers: { control: false } }, renderedContext);

    expect(closeOverlayCalls).toBe(1);
  });

  test('showing the list writes no shared state', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);

    expect(sharedWrites).toEqual([]);
    expect(overlayCloseCount()).toBe(0);
  });

  test('escape records one close and closes the picker', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    keyDownHandler?.({ key: 'escape', modifiers: { control: false } }, renderedContext);

    expect(overlayCloseCount()).toBe(1);
    expect(closeOverlayCalls).toBe(1);
  });

  test('closing the list view records one close', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.close();

    expect(overlayCloseCount()).toBe(1);
  });

  test('a repeated close adds another count', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.close();
    view.close();

    expect(overlayCloseCount()).toBe(2);
  });
});
