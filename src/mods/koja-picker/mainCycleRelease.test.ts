import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PaneInfo, SpaceInfo } from 'herdr';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import { paneOf, spaceOf, tabOf } from '../../../tests/pickerFixtures.ts';

type ModifierHandler = (event: { modifiers: { control: boolean; shift?: boolean } }) => void;

type KeyDownHandler = (
  event: { key: string; modifiers: { control: boolean } },
  cx: unknown,
) => void;

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

// The build defines this global for each mod; the picker's preview code reads it at load time.
Object.assign(globalThis, { kojaModName: 'koja-picker' });

let modifierHandler: ModifierHandler | null = null;
let keyDownHandler: KeyDownHandler | null = null;
let keyBindings: { keystroke: string; action: string; context?: string }[] = [];
let props: Record<string, unknown> = {};
let spaceValues: SpaceInfo[] = [];
let paneValues: PaneInfo[] = [];
let focusedValue: { space: string } | null = null;
let runCalls: RunCall[] = [];
let sharedValues: Record<string, unknown> = {};
let closeOverlayCalls = 0;
let pendingCommands: string[] = [];
let commandWaiters: ((command: string) => void)[] = [];
let inputValue = '';
let inputChange: ((cx: unknown) => void) | null = null;

const renderedContext = {
  notify: () => undefined,
  stop_propagation: () => undefined,
};

const chainable = (): unknown => {
  const element: unknown = new Proxy(() => element, {
    get: (_target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key === 'on_modifiers_changed') {
        return (handler: ModifierHandler) => {
          modifierHandler = handler;

          return element;
        };
      }

      if (key === 'on_key_down') {
        return (handler: KeyDownHandler) => {
          keyDownHandler = handler;

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
  on: (event: string, handler: (event: unknown, cx: unknown) => void) => {
    if (event === 'change') {
      inputChange = (cx) => {
        handler({}, cx);
      };
    }
  },
  focus: () => undefined,
  value: () => inputValue,
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: () => chainable(),
    InputState: { new: () => inputStub },
    v_flex: () => chainable(),
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

const nextCommand = (): Promise<string> => {
  const command = pendingCommands.shift();

  if (command !== undefined) {
    return Promise.resolve(command);
  }

  return new Promise<string>((resolve) => {
    commandWaiters.push(resolve);
  });
};

const pushCommand = (command: string): void => {
  const waiter = commandWaiters.shift();

  if (waiter !== undefined) {
    waiter(command);

    return;
  }

  pendingCommands.push(command);
};

await mock.module('herdr', () =>
  herdrFake({
    focused: () => focusedValue,
    nextCommand,
    panes: () => paneValues,
    props: () => props,
    run: (command: string, args?: Record<string, unknown>) => {
      runCalls.push({ command, args });

      return null;
    },
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => spaceValues,
    terminals: () => [],
  }),
);

const { overlayCloseCount, recordOverlayClose } = await import('../../kit/overlay/open.ts');

const { recordOf, stringOf } = await import('../../kit/fields.ts');

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    chipLineHeight: 0,
    closeOverlay: () => {
      closeOverlayCalls += 1;
    },
    colors: () => ({}),
    modName: 'koja-picker',
    overlayId: () => null,
    popupFrameRadius: 8,
    recordOf,
    recordOverlayClose,
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
  spawn: (body: (cx: unknown) => unknown) => {
    void body(asyncContext);
  },
  timer: {
    after: () => ({ cancel: () => undefined, is_done: () => true }),
    every: () => ({ cancel: () => undefined, is_done: () => true }),
  },
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  modifierHandler = null;
  keyDownHandler = null;
  keyBindings = [];
  props = { part: 'list' };
  spaceValues = [];
  paneValues = [];
  focusedValue = null;
  runCalls = [];
  sharedValues = {};
  closeOverlayCalls = 0;
  pendingCommands = [];
  commandWaiters = [];
  inputValue = '';
  inputChange = null;
});

const settle = async (): Promise<void> => {
  await Bun.sleep(0);
};

const cycle = async (): Promise<void> => {
  pushCommand('next');
  await settle();
};

const typeQuery = (query: string): void => {
  inputValue = query;
  inputChange?.(renderedContext);
};

const releaseControl = (): void => {
  modifierHandler?.({ modifiers: { control: false } });
};

const selectionCommands = (): RunCall[] =>
  runCalls.filter((call) => call.command === 'space.select');

describe('Control release', () => {
  test('Control release does not commit after a cycle with no matching space', async () => {
    focusedValue = { space: 's1' };
    spaceValues = [spaceOf('s1', 1, 'name-s1'), spaceOf('s2', 2, 'name-s2')];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    typeQuery('zzzzzz');
    await cycle();

    releaseControl();

    expect(selectionCommands()).toEqual([]);
    expect(closeOverlayCalls).toBe(0);
    expect(overlayCloseCount()).toBe(0);
  });

  test('Control release commits the space the cycle selected', async () => {
    focusedValue = { space: 's1' };

    spaceValues = [
      spaceOf('s1', 1, 'name-s1'),
      spaceOf('s2', 2, 'name-s2'),
      spaceOf('s3', 3, 'name-s3'),
    ];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    await cycle();
    releaseControl();

    expect(runCalls).toContainEqual({ command: 'space.select', args: { id: 's3' } });
    expect(closeOverlayCalls).toBe(1);
  });

  test('Escape after a cycle disarms the release', async () => {
    focusedValue = { space: 's1' };

    spaceValues = [
      spaceOf('s1', 1, 'name-s1'),
      spaceOf('s2', 2, 'name-s2'),
      spaceOf('s3', 3, 'name-s3'),
    ];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    await cycle();
    keyDownHandler?.({ key: 'escape', modifiers: { control: false } }, renderedContext);
    releaseControl();

    expect(selectionCommands()).toEqual([]);
    expect(closeOverlayCalls).toBe(1);
  });

  test('Control release commits nothing when the cycled space vanished', async () => {
    focusedValue = { space: 's1' };

    spaceValues = [
      spaceOf('s1', 1, 'name-s1'),
      spaceOf('s2', 2, 'name-s2'),
      spaceOf('s3', 3, 'name-s3'),
    ];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    await cycle();

    spaceValues = [spaceOf('s1', 1, 'name-s1'), spaceOf('s2', 2, 'name-s2')];
    releaseControl();

    expect(selectionCommands()).toEqual([]);
    expect(closeOverlayCalls).toBe(0);
  });

  test('a modifier change with Control still held commits nothing', async () => {
    focusedValue = { space: 's1' };

    spaceValues = [
      spaceOf('s1', 1, 'name-s1'),
      spaceOf('s2', 2, 'name-s2'),
      spaceOf('s3', 3, 'name-s3'),
    ];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    await cycle();
    modifierHandler?.({ modifiers: { control: true, shift: false } });

    expect(selectionCommands()).toEqual([]);
    expect(closeOverlayCalls).toBe(0);
    expect(overlayCloseCount()).toBe(0);
  });

  test('a Control cycle skips tab and pane rows to the next space', async () => {
    focusedValue = null;

    spaceValues = [
      spaceOf('s1', 1, 'name-s1', [tabOf('k1', 1, true), tabOf('k2', 2)]),
      spaceOf('s2', 2, 'name-s2', [tabOf('n1', 1, true)]),
    ];

    paneValues = [paneOf('p1', 'k1'), paneOf('p2', 'k1'), paneOf('p3', 'k2'), paneOf('p4', 'n1')];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    await cycle();
    releaseControl();

    expect(runCalls).toContainEqual({ command: 'space.select', args: { id: 's2' } });
    expect(runCalls).not.toContainEqual({ command: 'tab.select', args: { id: 'k1' } });
    expect(closeOverlayCalls).toBe(1);
  });

  test('a query edit after a cycle disarms the release', async () => {
    focusedValue = { space: 's1' };
    spaceValues = [spaceOf('s1', 1, 'name-s1'), spaceOf('s2', 2, 'name-s2')];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    await cycle();
    typeQuery('name-s1');
    releaseControl();

    expect(selectionCommands()).toEqual([]);
    expect(closeOverlayCalls).toBe(0);
  });
});
