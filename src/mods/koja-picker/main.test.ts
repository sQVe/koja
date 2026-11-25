import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PaneInfo, Program, SpaceInfo, TabInfo } from 'herdr';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

type KeyHandler = (event: { key: string; modifiers: { control: boolean } }, cx: unknown) => void;

// The build defines this global for each mod; the picker's preview code reads it at load time.
Object.assign(globalThis, { kojaModName: 'koja-picker' });

let keyDownHandler: KeyHandler | null = null;
let closeOverlayCalls = 0;
let props: Record<string, unknown> = {};
let spaceValues: unknown[] = [];
let paneValues: unknown[] = [];
let focusedValue: unknown = null;
let sharedValues: Record<string, unknown> = {};
let sharedWrites: string[] = [];
let keyBindings: { keystroke: string; action: string; context?: string }[] = [];
let keyContext: string | null = null;
let actionHandlers: Record<string, () => void> = {};
let emptyText = '';
let checkingNow = false;
let overlayNow: string | null = null;
let sideEffects: string[] = [];

const recordEffect =
  (name: string, result: unknown) =>
  (...args: unknown[]): unknown => {
    sideEffects.push([name, ...args.flat()].join(' '));

    return result;
  };

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

let inputValue = '';
let inputChange: ((cx: unknown) => void) | null = null;
let inputSubmit: (() => void) | null = null;

const inputStub = {
  on: (event: string, handler: (event: unknown, cx: unknown) => void) => {
    if (event === 'change') {
      inputChange = (cx) => {
        handler({}, cx);
      };
    }

    if (event === 'submit') {
      inputSubmit = () => {
        handler({}, renderedContext);
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
    checking: () => checkingNow,
    exec: async (...args: unknown[]) => {
      recordEffect('exec', null)(...args);

      return { code: 0, stdout: '/tmp/koja-picker.test\n', stderr: '' };
    },
    focused: () => focusedValue,
    hc: async (...args: unknown[]) => {
      recordEffect('hc', null)(...args);

      return { code: 0, stdout: 'w1:p1\n', stderr: '' };
    },
    nextCommand: () => new Promise<string>(() => {}),
    panes: () => paneValues,
    props: () => props,
    readTextFile: async (...args: unknown[]) => recordEffect('readTextFile', null)(...args),
    run: recordEffect('run', null),
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;
      sharedWrites.push(key);

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => spaceValues,
    terminals: () => [],
    writeTextFile: async (...args: unknown[]) => recordEffect('writeTextFile', null)(...args),
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
    overlayId: () => overlayNow,
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
  inputValue = '';
  inputChange = null;
  inputSubmit = null;
  spaceValues = [];
  paneValues = [];
  focusedValue = null;
  checkingNow = false;
  overlayNow = null;
  sideEffects = [];
});

const settle = async (): Promise<void> => {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
};

const resumedPreview = {
  part: 'list',
  preview: {
    folder: '/tmp/koja-picker.test',
    state: '/tmp/koja-picker.test/state',
    viewer: 'w1:p1',
  },
};

describe('picker preview during herdr-app check', () => {
  test('a list with a running preview starts no process and writes no file', async () => {
    checkingNow = true;
    props = resumedPreview;

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.close();
    await settle();

    expect(sideEffects).toEqual([]);
  });

  test('the preview part opens no preview', async () => {
    checkingNow = true;
    props = { part: 'preview' };
    overlayNow = 'overlay-3';

    const view = await loadView();

    const spawningContext = {
      ...asyncContext,
      spawn: (body: () => Promise<void>) => {
        body().catch(() => undefined);
      },
    };

    view.init(undefined, spawningContext);
    view.close();
    await settle();

    expect(sideEffects).toEqual([]);
  });

  test('outside a check, a list with a running preview writes its heartbeat', async () => {
    props = resumedPreview;

    const view = await loadView();

    view.init(undefined, asyncContext);
    await settle();

    const heartbeat = sideEffects.filter((effect) =>
      effect.startsWith('writeTextFile /tmp/koja-picker.test/heartbeat'),
    );

    expect(heartbeat).toHaveLength(1);
  });

  test('outside a check, the preview part makes a preview folder', async () => {
    props = { part: 'preview' };
    overlayNow = 'overlay-3';

    const view = await loadView();

    const spawningContext = {
      ...asyncContext,
      spawn: (body: () => Promise<void>) => {
        body().catch(() => undefined);
      },
    };

    view.init(undefined, spawningContext);
    await settle();

    expect(sideEffects).toContain('exec mktemp -d -t koja-picker.XXXXXX');
  });
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

  test('a query names the filter the list is using', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    const query = 'zzz';

    const allWithoutQuery = emptyText;

    inputValue = query;
    expect(inputChange).not.toBeNull();
    inputChange?.(renderedContext);
    view.render();

    expect(emptyText).toBe(allWithoutQuery);

    const presses = [
      { keystroke: 'tab', label: 'Needs you' },
      { keystroke: 'tab', label: 'Blocked' },
    ];

    for (const { keystroke, label } of presses) {
      const binding = keyBindings.find((entry) => entry.keystroke === keystroke);

      actionHandlers[binding?.action ?? '']?.();
      view.render();

      expect(emptyText).toContain(label);
      expect(emptyText).toContain(query);
      expect(emptyText).not.toBe(allWithoutQuery);
    }
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

describe('picker space choice', () => {
  test('choosing a space records the selection it runs', async () => {
    spaceValues = [
      {
        id: 's1',
        index: 1,
        name: 'api',
        named: true,
        folder: '/code/api',
        machine: null,
        branch: null,
        active: true,
        status: null,
        tabs: [],
      },
    ];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    inputSubmit?.();

    expect(sharedValues['spaces.selection']).toEqual({ version: 1, count: 1, id: 's1' });
  });
});

const shell: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

const tabOf = (id: string, index: number): TabInfo => ({
  id,
  index,
  name: String(index),
  named: false,
  active: index === 1,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

const spaceOf = (id: string, index: number, tabs: TabInfo[]): SpaceInfo => ({
  id,
  index,
  name: `name-${id}`,
  named: true,
  folder: `/code/${id}`,
  machine: null,
  branch: null,
  active: index === 1,
  status: null,
  tabs,
});

const paneOf = (pane: string, tab: string): PaneInfo => ({
  pane,
  terminal: `terminal-${pane}`,
  tab,
  title: `title-${pane}`,
  cwd: null,
  branch: null,
  status: null,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

describe('picker tab and pane choice', () => {
  const chooseRow = async (downs: number): Promise<void> => {
    focusedValue = { space: 's1' };

    spaceValues = [
      spaceOf('s1', 1, [tabOf('k1', 1)]),
      spaceOf('s2', 2, [tabOf('n1', 1), tabOf('n2', 2)]),
    ];

    paneValues = [paneOf('p1', 'k1'), paneOf('p2', 'n1'), paneOf('p3', 'n1'), paneOf('p4', 'n2')];

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    for (let step = 0; step < downs; step += 1) {
      keyDownHandler?.({ key: 'down', modifiers: { control: false } }, renderedContext);
    }

    inputSubmit?.();
  };

  test('a tab row in another space records that space', async () => {
    await chooseRow(1);

    expect(sharedValues['spaces.selection']).toEqual({ version: 1, count: 1, id: 's2' });
  });

  test('a pane row in another space records that space', async () => {
    await chooseRow(2);

    expect(sharedValues['spaces.selection']).toEqual({ version: 1, count: 1, id: 's2' });
  });
});
