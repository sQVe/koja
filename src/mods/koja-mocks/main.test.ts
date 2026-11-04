import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import { overlaySize } from '../../kit/size.ts';
import { sceneOrigin } from './catalog.ts';

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
const shownTexts: string[] = [];
let input: InputStub;

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
        input = createInput();

        return input;
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
    props: () => ({}),
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    closeOverlay: () => {
      closeCount += 1;
    },
    emptyState: (text: string) => {
      shownTexts.push(text);

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
  input.text = text;
  input.handlers.submit?.({}, { notify: () => undefined });
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  openedSpecs.length = 0;
  closeCount = 0;
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

  test('submitting an unknown name opens nothing and keeps the picker with its error', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    submitTyped('no-such-scene');
    view.render();

    expect(openedSpecs).toEqual([]);
    expect(closeCount).toBe(0);
    expect(shownTexts.at(-1)).toContain('no-such-scene');
  });
});
