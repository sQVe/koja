import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

type KeyHandler = (
  event: { key: string },
  cx: { stop_propagation: () => void; notify: () => void },
) => void;

const storage = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  },
});

let keyDownHandler: KeyHandler | null = null;
let closeOverlayCalls = 0;
let sharedValues: Record<string, unknown> = {};
let sharedWrites: string[] = [];

const chainable = (): unknown =>
  new Proxy(() => undefined, {
    get: (_target, key) => (key === 'then' ? undefined : chainable()),
    apply: () => chainable(),
  });

const surface = (): unknown => {
  const element: unknown = new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === 'on_key_down') {
        return (handler: KeyHandler) => {
          keyDownHandler = handler;

          return element;
        };
      }

      return key === 'then' ? undefined : chainable();
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
    InputState: { new: () => inputStub },
    v_flex: chainable,
  }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({
    div: surface,
    View: class {
      render(): unknown {
        return null;
      }
    },
  }),
);

await mock.module('herdr', () =>
  herdrFake({
    commands: () => [],
    layouts: () => [],
    openOverlay: () => 'overlay-2',
    run: () => null,
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;
      sharedWrites.push(key);

      return null;
    },
    shared: (key: string) => sharedValues[key],
  }),
);

const { overlayCloseCount, recordOverlayClose } = await import('../../kit/overlayOpen.ts');

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    recordOverlayClose,
    closeOverlay: () => {
      closeOverlayCalls += 1;
    },
    currentWindow: () => null,
    detailText: chainable,
    emptyState: chainable,
    highlightedText: chainable,
    keyHint: chainable,
    listRow: chainable,
    overlaySize: {},
    popupSurface: surface,
    searchField: chainable,
    sectionHeader: chainable,
    shortcutFor: () => null,
    spacing: {},
    stringOf: () => null,
    themeChoices: [],
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
  focus_handle: () => ({ focus: () => undefined, is_focused: () => false }),
  timer: { after: () => undefined },
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  keyDownHandler = null;
  closeOverlayCalls = 0;
  sharedValues = {};
  sharedWrites = [];
});

describe('palette overlay state', () => {
  test('opening the palette writes no shared state', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);

    expect(sharedWrites).toEqual([]);
    expect(overlayCloseCount()).toBe(0);
  });

  test('escape records one close and closes the palette', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    keyDownHandler?.(
      { key: 'escape' },
      { stop_propagation: () => undefined, notify: () => undefined },
    );

    expect(overlayCloseCount()).toBe(1);
    expect(closeOverlayCalls).toBe(1);
  });

  test('closing the view records one close', async () => {
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
