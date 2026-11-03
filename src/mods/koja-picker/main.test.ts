import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

type KeyHandler = (event: { key: string; modifiers: { control: boolean } }, cx: unknown) => void;

// The build defines this global for each mod; the picker's preview code reads it at load time.
Object.assign(globalThis, { kojaModName: 'koja-picker' });

let keyDownHandler: KeyHandler | null = null;
let closeOverlayCalls = 0;
let props: Record<string, unknown> = {};
let sharedValues: Record<string, unknown> = {};
let sharedWrites: string[] = [];

const chainable = (onKeyDown?: (handler: KeyHandler) => void): unknown => {
  const element: unknown = new Proxy(() => element, {
    get: (_target, key) => {
      if (key === 'then') {
        return undefined;
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

await mock.module('gpui-base', () => ({
  h_flex: () => chainable(),
  InputState: { new: () => inputStub },
  v_flex: () =>
    chainable((handler) => {
      keyDownHandler = handler;
    }),
  v_virtual_list: () => chainable(),
  VirtualListScrollHandle: { new: () => chainable() },
}));

await mock.module('gpui-kit', () => ({
  div: () => chainable(),
  View: class {
    render(): unknown {
      return null;
    }
  },
}));

await mock.module('herdr', () => ({
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
}));

const { overlayCloseCount, recordOverlayClose } = await import('../../kit/overlayOpen.ts');

const { recordOf, stringOf } = await import('../../kit/fields.ts');

await mock.module('../../kit/index.ts', () => ({
  recordOverlayClose,
  closeOverlay: () => {
    closeOverlayCalls += 1;
  },
  colors: () => chainable(),
  emptyState: () => chainable(),
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
  statusMark: () => chainable(),
  stringOf,
  textSize: {},
  toggleButton: () => chainable(),
}));

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
  focus_handle: () => ({ focus: () => undefined, is_focused: () => false }),
  spawn: () => undefined,
  timer: { after: () => undefined, every: () => undefined },
};

const renderedContext = {
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
});

describe('picker overlay state', () => {
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
