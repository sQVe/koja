import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { readDialogCommand } from '../../kit/dialogPayload.ts';
import { recordOf, stringOf } from '../../kit/fields.ts';

type KeyHandler = (
  event: { key: string },
  cx: { stop_propagation: () => void; notify: () => void },
) => void;

interface RunCall {
  name: string;
  args: Record<string, unknown>;
}

type Call = 'close' | RunCall;

let calls: Call[] = [];
let dialogProps: Record<string, unknown> = {};
let keyDownHandler: KeyHandler | null = null;
let typedValue = '';
let openedValue: string | null = null;
let selectedRanges: { start: number; end: number }[] = [];
const inputHandlers = new Map<string, () => void>();

const frameSurface = (): unknown => {
  const element: unknown = new Proxy(() => undefined, {
    get: (_target, key) => {
      if (key === 'on_key_down') {
        return (handler: KeyHandler) => {
          keyDownHandler = handler;

          return element;
        };
      }

      if (key === 'track_focus') {
        return () => element;
      }

      return key === 'then' ? undefined : chainable();
    },
    apply: () => element,
  });

  return element;
};

const inputStub = {
  on: (event: string, handler: () => void) => {
    inputHandlers.set(event, handler);

    return true;
  },
  focus: () => undefined,
  set_selected_range: (range: { start: number; end: number }) => {
    selectedRanges.push(range);
  },
  value: () => typedValue,
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    InputState: {
      new: (options: { value: string }) => {
        openedValue = options.value;

        return inputStub;
      },
    },
    v_flex: chainable,
  }),
);

await mock.module('gpui-kit', () => gpuiKitFake());

await mock.module('herdr', () =>
  herdrFake({
    props: () => dialogProps,
    run: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });

      return null;
    },
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    closeOverlay: () => {
      calls.push('close');
    },
    dialogFrame: frameSurface,
    readDialogCommand,
    recordOf,
    stringOf,
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

const keyContext = { stop_propagation: () => undefined, notify: () => undefined };

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  calls = [];
  keyDownHandler = null;
  inputHandlers.clear();
  typedValue = '';
  openedValue = null;
  selectedRanges = [];

  dialogProps = {
    title: 'rename tab',
    value: 'Old name',
    command: { name: 'tab.rename', args: { id: 'tab-1', name: 'stale' } },
  };
});

describe('prompt saving', () => {
  test('saving closes the overlay, then runs the command with the typed name', async () => {
    const view = await loadView();
    typedValue = 'New name';

    view.init(undefined, asyncContext);
    inputHandlers.get('submit')?.();

    expect(calls).toEqual([
      'close',
      { name: 'tab.rename', args: { id: 'tab-1', name: 'New name' } },
    ]);
  });

  test('escape closes the overlay and runs nothing', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    keyDownHandler?.({ key: 'escape' }, keyContext);

    expect(calls).toEqual(['close']);
  });
});

describe('prompt initial selection', () => {
  test('a prompt opened with a value starts with it, all selected', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);

    expect(openedValue).toBe('Old name');
    expect(selectedRanges).toEqual([{ start: 0, end: 'Old name'.length }]);
  });

  test('a prompt opened with no value starts empty and selects nothing', async () => {
    dialogProps = { ...dialogProps, value: undefined };
    const view = await loadView();

    view.init(undefined, asyncContext);

    expect(openedValue).toBe('');
    expect(selectedRanges).toEqual([]);
  });
});
