import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { drawn } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { overlaySize } from '../../kit/size.ts';
import { findScene, sceneOrigin, sceneReadyLine } from './catalog.ts';
import { sceneFields } from './scenes/inputs.ts';

type SubmitHandler = (event: unknown, cx: { notify: () => void }) => void;

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
const spyOnLog = () => spyOn(console, 'log').mockImplementation(() => undefined);

const createdInputs: InputStub[] = [];
const focusedInputs: InputStub[] = [];
const drawnInputs: InputStub[] = [];
const pendingTimers: (() => void)[] = [];
let focusHandleCalls = 0;
let log: ReturnType<typeof spyOnLog>;

const createInput = (): InputStub => {
  const stub: InputStub = {
    handlers: {},
    text: '',
    on: (event, handler) => {
      stub.handlers[event] = handler;
    },
    focus: () => {
      focusedInputs.push(stub);
    },
    value: () => stub.text,
  };

  return stub;
};

const chainable = (): unknown =>
  new Proxy(() => undefined, {
    get: (_target, key) => (key === 'then' ? undefined : chainable()),
    apply: () => chainable(),
  });

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    Input: {
      new: (state: InputStub) => {
        drawnInputs.push(state);

        return chainable();
      },
    },
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
    div: chainable,
    svg: chainable,
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

Object.assign(globalThis, { kojaModName: 'koja-mocks' });

const realKitParts = await realKitIndexFake([
  'button',
  'icon',
  'searchField',
  'size',
  'statusMark',
  'tab',
  'textField',
  'textRole',
  'theme',
]);

await mock.module('../../kit/index.ts', () => ({
  ...realKitParts,
  closeOverlay: () => {
    closeCount += 1;
  },
  stateLine: (options: { kind: string; text: string }) => {
    shownKinds.push(options.kind);
    shownTexts.push(options.text);

    return chainable();
  },
  modName: 'koja-mocks',
  popupSurface: () => drawn(),
  recordOf: (value: unknown) => (typeof value === 'object' && value !== null ? value : {}),
  stringOf: (value: unknown) => (typeof value === 'string' ? value : null),
}));

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
  focus_handle: () => ({
    focus: () => {
      focusHandleCalls += 1;
    },
    is_focused: () => false,
  }),
  timer: { after: () => undefined },
};

const layoutContext = {
  timer: {
    after: (_milliseconds: number, handler: () => void) => {
      pendingTimers.push(handler);
    },
  },
};

const drawScene = (view: { render: () => unknown }): void => {
  const surface = view.render() as DrawnElement;

  for (const handler of surface.sizeHandlers) {
    handler({ width: 100, height: 100 }, layoutContext);
  }
};

const lastFocus = (): InputStub => {
  const focused = focusedInputs.at(-1);

  if (focused === undefined) {
    throw new Error('No field took the keyboard.');
  }

  return focused;
};

const expectDrawnFieldHoldsKeyboard = (): void => {
  expect(drawnInputs).toContain(lastFocus());
  expect(focusHandleCalls).toBe(0);
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
  focusedInputs.length = 0;
  drawnInputs.length = 0;
  focusHandleCalls = 0;
  openedSpecs.length = 0;
  pendingTimers.length = 0;
  closeCount = 0;
  sceneProps = {};
  shownKinds.length = 0;
  shownTexts.length = 0;
  log = spyOnLog();
});

afterEach(() => {
  log.mockRestore();
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

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    expect(log).not.toHaveBeenCalled();
    expect(pendingTimers).toEqual([]);

    drawScene(view);

    expect(log).not.toHaveBeenCalled();
    expect(pendingTimers).toHaveLength(1);

    runTimers();

    expect(log.mock.calls).toEqual([[sceneReadyLine('attention-brief')]]);
  });

  test('a scene laid out again writes no second ready line', async () => {
    sceneProps = { scene: 'attention-brief' };

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    drawScene(view);
    runTimers();

    view.render();
    drawScene(view);
    runTimers();

    expect(log.mock.calls).toHaveLength(1);
  });

  test('the picker writes no ready line', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    drawScene(view);
    runTimers();

    expect(log).not.toHaveBeenCalled();
  });

  test('a scene without its inputs writes no ready line', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    sceneProps = { scene: 'attention-brief' };
    view.render();
    drawScene(view);
    runTimers();

    expect(log).not.toHaveBeenCalled();
  });

  test('an unknown scene writes no ready line', async () => {
    sceneProps = { scene: 'no-such-scene' };

    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    drawScene(view);
    runTimers();

    expect(log).not.toHaveBeenCalled();
  });
});

describe('keyboard focus', () => {
  test.each(Object.keys(sceneFields))(
    'the %s scene gives the keyboard to the field it draws',
    async (name) => {
      sceneProps = { scene: name };

      const view = await loadView();

      view.init(undefined, asyncContext);
      view.render();

      expectDrawnFieldHoldsKeyboard();
    },
  );

  test('the refocus after the first frame gives the keyboard to the drawn field', async () => {
    sceneProps = { scene: 'smoke-2' };

    const view = await loadView();

    view.init(undefined, { ...asyncContext, timer: layoutContext.timer });
    view.render();
    focusedInputs.length = 0;
    runTimers();

    expectDrawnFieldHoldsKeyboard();
  });

  test('the first frame gives the keyboard to the drawn field before the ready line', async () => {
    sceneProps = { scene: 'smoke-2' };

    const view = await loadView();

    view.init(undefined, { ...asyncContext, timer: layoutContext.timer });
    focusedInputs.length = 0;
    drawScene(view);

    expectDrawnFieldHoldsKeyboard();
    expect(log).not.toHaveBeenCalled();

    runTimers();

    expect(log.mock.calls).toEqual([[sceneReadyLine('smoke-2')]]);
  });

  test('a scene laid out again does not take the keyboard again', async () => {
    sceneProps = { scene: 'smoke-2' };

    const view = await loadView();

    view.init(undefined, { ...asyncContext, timer: layoutContext.timer });
    drawScene(view);
    runTimers();

    expectDrawnFieldHoldsKeyboard();

    focusedInputs.length = 0;

    drawScene(view);
    runTimers();

    expect(focusedInputs).toEqual([]);
    expect(focusHandleCalls).toBe(0);
  });

  test('a scene that draws no search field keeps the keyboard on the view', async () => {
    sceneProps = { scene: 'attention-brief' };

    const view = await loadView();

    view.init(undefined, { ...asyncContext, timer: layoutContext.timer });
    view.render();

    expect(focusHandleCalls).toBe(1);

    runTimers();

    expect(focusedInputs).toEqual([]);
    expect(focusHandleCalls).toBe(2);
  });

  test('the picker gives the keyboard to its own search field', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    expect(drawnInputs).toHaveLength(1);
    expectDrawnFieldHoldsKeyboard();
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
