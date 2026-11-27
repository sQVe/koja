import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

type KeyHandler = (event: { key: string; modifiers: { control: boolean } }, cx: unknown) => void;

type ActionHandler = (event: unknown, cx: unknown) => void;

const palette = {
  border: '#999ca7',
  blocked: '#c0392b',
  dim: '#525460',
  done: '#2e7d32',
  foreground: '#1e2028',
  hover: '#cdd0d7',
  idle: '#525460',
  muted: '#3a3d4c',
  working: '#b8860b',
} as const;

// The build defines this global for each mod; the picker's preview code reads it at load time.
Object.assign(globalThis, { kojaModName: 'koja-picker' });

let keyBindings: { keystroke: string; action: string; context?: string }[] = [];
let actionHandlers: Record<string, ActionHandler> = {};
let chipScrollCalls: number[] = [];
let listScrollCalls: number[] = [];
let props: Record<string, unknown> = {};
let spaceValues: SpaceInfo[] = [];
let focusedValue: { space: string } | null = null;
let sharedValues: Record<string, unknown> = {};

const renderedContext = {
  notify: () => undefined,
  stop_propagation: () => undefined,
};

const chipScroll = {
  offset: () => ({ x: 0, y: 0 }),
  content_size: () => ({ width: 0, height: 0 }),
  viewport_size: () => ({ width: 0, height: 0 }),
  scroll_to_item: (index: number) => {
    chipScrollCalls.push(index);
  },
  release: () => true,
};

const listScroll = {
  offset: () => ({ x: 0, y: 0 }),
  content_size: () => ({ width: 0, height: 0 }),
  viewport_size: () => ({ width: 0, height: 0 }),
  scroll_to_item: (index: number) => {
    listScrollCalls.push(index);
  },
  release: () => true,
};

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

      if (key === 'on_action') {
        return (action: string, handler: ActionHandler) => {
          actionHandlers[action] = handler;

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
    ScrollHandle: { new: () => chipScroll },
    v_flex: () => chainable(),
    v_virtual_list: () => chainable(),
    VirtualListScrollHandle: { new: () => listScroll },
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
    focused: () => focusedValue,
    panes: () => [],
    props: () => props,
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => spaceValues,
    terminals: () => [],
  }),
);

const { recordOf, stringOf } = await import('../../kit/fields.ts');

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    chipLineHeight: 0,
    colors: () => palette,
    modName: 'koja-picker',
    overlayId: () => null,
    popupFrameRadius: 8,
    recordOf,
    repeat: () => undefined,
    searchField: () => chainable(),
    sectionHeader: () => chainable(),
    segmentedChip: () => chainable(),
    spacing: {},
    stateLine: () => chainable(),
    statusMark: () => chainable(),
    stringOf,
    withTextRole: (element: unknown) => element,
  }),
);

const loadView = async (): Promise<{
  init: (props: unknown, cx: unknown) => void;
  render: () => unknown;
}> => {
  const modulePath = './main.ts';

  const loaded = (await import(modulePath)) as {
    default: new () => {
      init: (props: unknown, cx: unknown) => void;
      render: () => unknown;
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
  notify: () => undefined,
  spawn: () => undefined,
  timer: {
    after: () => ({ cancel: () => undefined, is_done: () => true }),
    every: () => ({ cancel: () => undefined, is_done: () => true }),
  },
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  keyBindings = [];
  actionHandlers = {};
  chipScrollCalls = [];
  listScrollCalls = [];
  props = { part: 'list' };
  spaceValues = [];
  focusedValue = null;
  sharedValues = {};
});

const spaceOf = (id: string, index: number): SpaceInfo => ({
  id,
  index,
  name: `name-${id}`,
  named: true,
  folder: `/code/${id}`,
  machine: null,
  branch: null,
  active: index === 1,
  status: null,
  tabs: [],
});

const press = (keystroke: string): void => {
  const binding = keyBindings.find((entry) => entry.keystroke === keystroke);

  expect(binding).toBeDefined();
  actionHandlers[binding?.action ?? '']?.({}, renderedContext);
};

describe('filter chips', () => {
  test('a keyboard filter change reveals the active chip', async () => {
    focusedValue = { space: 's1' };
    spaceValues = [spaceOf('s1', 1), spaceOf('s2', 2)];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    press('tab');
    press('shift-tab');

    expect(chipScrollCalls).toEqual([1, 0]);
  });
});
