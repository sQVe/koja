import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import { overlaySize } from '../../kit/size.ts';
import { findScene, sceneOrigin, sceneReadyLine } from './catalog.ts';

type SubmitHandler = (event: unknown, cx: { notify: () => void }) => void;

type LayoutHandler = (size: { width: number; height: number }, cx: unknown) => void;

interface InputStub {
  handlers: Record<string, SubmitHandler>;
  text: string;
  on: (event: string, handler: SubmitHandler) => void;
  focus: () => void;
  value: () => string;
}

const openedSpecs: unknown[] = [];
let closeCount = 0;
let sceneProps: Record<string, unknown> = {};
const shownKinds: string[] = [];
const shownTexts: string[] = [];
const createdInputs: InputStub[] = [];
const layoutHandlers: LayoutHandler[] = [];
const pendingTimers: (() => void)[] = [];

const createInput = (): InputStub => {
  const stub: InputStub = {
    handlers: {},
    text: '',
    on: (event, handler) => {
      stub.handlers[event] = handler;
    },
    focus: () => undefined,
    value: () => stub.text,
  };

  return stub;
};

const chainable = (): unknown =>
  new Proxy(() => undefined, {
    get: (_target, key) => (key === 'then' ? undefined : chainable()),
    apply: () => chainable(),
  });

// The scene's root surface reports its layout once the frame that draws it is laid out.
const surfaceFake = (): unknown => {
  const element: unknown = new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key === 'on_size_change') {
        return (handler: LayoutHandler) => {
          layoutHandlers.push(handler);

          return element;
        };
      }

      return () => element;
    },
    apply: () => element,
  });

  return element;
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    InputState: {
      new: () => {
        const created = createInput();

        createdInputs.push(created);

        return created;
      },
    },
    h_flex: chainable,
    v_flex: chainable,
  }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({
    View: class {
      render(): unknown {
        return null;
      }
    },
  }),
);

await mock.module('herdr', () =>
  herdrFake({
    openOverlay: (spec: unknown) => {
      openedSpecs.push(spec);

      return 'scene-1';
    },
    props: () => sceneProps,
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    closeOverlay: () => {
      closeCount += 1;
    },
    iconButton: chainable,
    stateLine: (options: { kind: string; text: string }) => {
      shownKinds.push(options.kind);
      shownTexts.push(options.text);

      return chainable();
    },
    modName: 'koja-mocks',
    popupSurface: surfaceFake,
    recordOf: (value: unknown) => (typeof value === 'object' && value !== null ? value : {}),
    searchField: chainable,
    spacing: {},
    stringOf: (value: unknown) => (typeof value === 'string' ? value : null),
  }),
);

await mock.module('./directions/attention/brief.ts', () => ({ briefScene: chainable }));

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
  focus_handle: () => ({ focus: () => undefined, is_focused: () => false }),
  timer: { after: () => undefined },
};

const layoutContext = {
  timer: {
    after: (_milliseconds: number, handler: () => void) => {
      pendingTimers.push(handler);
    },
  },
};

const layOutScene = (): void => {
  for (const handler of layoutHandlers.splice(0)) {
    handler({ width: 100, height: 100 }, layoutContext);
  }
};

const runTimers = (): void => {
  for (const timer of pendingTimers.splice(0)) {
    timer();
  }
};

const submitTyped = (text: string): void => {
  const [picker] = createdInputs;

  if (picker === undefined) {
    throw new Error('The picker created no input.');
  }

  picker.text = text;
  picker.handlers.submit?.({}, { notify: () => undefined });
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  createdInputs.length = 0;
  layoutHandlers.length = 0;
  openedSpecs.length = 0;
  pendingTimers.length = 0;
  closeCount = 0;
  sceneProps = {};
  shownKinds.length = 0;
  shownTexts.length = 0;
});

describe('scene picker', () => {
  test('submitting a known name opens one window with the scene and closes the picker', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    submitTyped('sidebar');

    expect(openedSpecs).toEqual([
      {
        mod: 'koja-mocks',
        props: { scene: 'sidebar' },
        kind: 'window',
        frame: 'none',
        at: sceneOrigin,
        width: overlaySize.wideMenuWidth,
        height: overlaySize.wideMenuHeight,
      },
    ]);

    expect(closeCount).toBe(1);
  });

  const scenes = [
    'sidebar',
    'states',
    'popup',
    'controls',
    'shell',
    'shell-pr-view',
    'shell-draft-review',
    'shell-ticket',
    'pane-headers',
    'pane-headers-roles',
    'sidebar-parts',
    'header-mark-name',
    'header-mark-right',
    'header-mark-right-active',
    'header-mark-left-active',
    'header-mark-after-name',
    'header-mark-left-flat',
    'header-mark-after-name-flat',
    'header-mark-left-divider',
    'header-mark-left-divider-inset',
    'header-mark-left-divider-soft',
    'shell-attention',
    'shell-attention-normal',
    'shell-attention-open',
  ];

  test.each(scenes)('submitting %s opens its window at its catalog size', async (name) => {
    const view = await loadView();
    const lookup = findScene(name);
    const size = 'scene' in lookup ? lookup.scene : { width: 0, height: 0 };

    view.init(undefined, asyncContext);
    submitTyped(name);

    expect(openedSpecs).toEqual([
      expect.objectContaining({ props: { scene: name }, width: size.width, height: size.height }),
    ]);
  });

  test('submitting an unknown name opens nothing and keeps the picker with its error', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    submitTyped('no-such-scene');
    view.render();

    expect(openedSpecs).toEqual([]);
    expect(closeCount).toBe(0);
    expect(shownKinds.at(-1)).toBe('error');
    expect(shownTexts.at(-1)).toContain('no-such-scene');
  });

  test('the picker hint is an empty state before any error', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    expect(shownKinds.at(-1)).toBe('empty');
  });
});

describe('scene readiness', () => {
  test('a scene writes its ready line only after the frame that draws it has run', async () => {
    sceneProps = { scene: ' attention-brief ' };
    const log = spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const view = await loadView();

      view.init(undefined, asyncContext);
      view.render();

      expect(log).not.toHaveBeenCalled();

      layOutScene();

      expect(log).not.toHaveBeenCalled();

      runTimers();

      expect(log.mock.calls).toEqual([[sceneReadyLine('attention-brief')]]);
    } finally {
      log.mockRestore();
    }
  });

  test('a scene laid out again writes no second ready line', async () => {
    sceneProps = { scene: 'attention-brief' };
    const log = spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const view = await loadView();

      view.init(undefined, asyncContext);
      view.render();
      layOutScene();
      runTimers();

      view.render();
      layOutScene();
      runTimers();

      expect(log.mock.calls).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  test('the picker writes no ready line', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const view = await loadView();

      view.init(undefined, asyncContext);
      view.render();
      layOutScene();
      runTimers();

      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  test('an unknown scene writes no ready line', async () => {
    sceneProps = { scene: 'no-such-scene' };
    const log = spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const view = await loadView();

      view.init(undefined, asyncContext);
      view.render();
      layOutScene();
      runTimers();

      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  test('a scene without its inputs writes no ready line', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      const view = await loadView();

      view.init(undefined, asyncContext);
      sceneProps = { scene: 'attention-brief' };
      view.render();
      layOutScene();
      runTimers();

      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe('scene errors', () => {
  test('an unknown scene prop asks for the error state', async () => {
    sceneProps = { scene: 'no-such-scene' };

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    expect(shownKinds.at(-1)).toBe('error');
  });

  test('a scene without its inputs asks for the error state', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    sceneProps = { scene: 'sidebar' };
    view.render();

    expect(shownKinds.at(-1)).toBe('error');
  });
});
