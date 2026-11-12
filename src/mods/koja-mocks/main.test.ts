import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import { overlaySize } from '../../kit/size.ts';
import { findScene, sceneOrigin } from './catalog.ts';

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
const createdInputs: InputStub[] = [];

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
    popupSurface: chainable,
    recordOf: (value: unknown) => (typeof value === 'object' && value !== null ? value : {}),
    searchField: chainable,
    spacing: {},
    stringOf: (value: unknown) => (typeof value === 'string' ? value : null),
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
  focus_handle: () => ({ focus: () => undefined, is_focused: () => false }),
  timer: { after: () => undefined },
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
  openedSpecs.length = 0;
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
