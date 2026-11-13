import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  dialogFrameFake,
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
let buttonKinds: string[] = [];
let stopPropagationCount = 0;
let sharedValues: Record<string, unknown> = {};
const buttonHandlers = new Map<string, () => void>();

const recordButton = (options: { kind: string }): unknown => {
  buttonKinds.push(options.kind);

  const element: Record<string, unknown> = {
    on_click: (handler: () => void) => {
      buttonHandlers.set(options.kind, handler);

      return element;
    },
  };

  return element;
};

await mock.module('gpui-kit', () => gpuiKitFake());

await mock.module('herdr', () =>
  herdrFake({
    props: () => dialogProps,
    run: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });

      return null;
    },
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;

      return null;
    },
    shared: (key: string) => sharedValues[key],
  }),
);

const { overlayCloseCount, recordOverlayClose } = await import('../../kit/overlayOpen.ts');

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    closeOverlay: () => {
      calls.push('close');
    },
    dialogButton: recordButton,
    dialogFrame: () =>
      dialogFrameFake((handler: KeyHandler) => {
        keyDownHandler = handler;
      }),
    readDialogCommand,
    recordOf,
    recordOverlayClose,
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

const keyContext = {
  stop_propagation: () => {
    stopPropagationCount += 1;
  },
  notify: () => undefined,
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  calls = [];
  keyDownHandler = null;
  buttonKinds = [];
  stopPropagationCount = 0;
  sharedValues = {};
  buttonHandlers.clear();

  dialogProps = {
    title: 'Close space?',
    detail: 'Its 2 tabs will close.',
    action: 'Close',
    destroys: true,
    command: { name: 'space.close', args: { id: 'space-1', confirmed: true } },
  };
});

describe('confirm', () => {
  test('enter closes the overlay, then runs the command with its args', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    keyDownHandler?.({ key: 'enter' }, keyContext);

    expect(calls).toEqual([
      'close',
      { name: 'space.close', args: { id: 'space-1', confirmed: true } },
    ]);

    expect(overlayCloseCount()).toBe(1);

    expect(stopPropagationCount).toBe(1);
  });

  test('escape closes the overlay and runs nothing', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    keyDownHandler?.({ key: 'escape' }, keyContext);

    expect(calls).toEqual(['close']);
    expect(overlayCloseCount()).toBe(1);
  });

  test('cancel closes the overlay and runs nothing', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    buttonHandlers.get('outline')?.();

    expect(calls).toEqual(['close']);
    expect(overlayCloseCount()).toBe(1);
  });

  test('the action button closes the overlay, then runs the command', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();
    buttonHandlers.get('danger')?.();

    expect(calls).toEqual([
      'close',
      { name: 'space.close', args: { id: 'space-1', confirmed: true } },
    ]);

    expect(overlayCloseCount()).toBe(1);
  });

  test('a destroying action is drawn as danger, next to an outlined cancel', async () => {
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    expect(buttonKinds).toEqual(['outline', 'danger']);
  });

  test('a non-destroying action is drawn as solid', async () => {
    dialogProps = { ...dialogProps, destroys: false };
    const view = await loadView();

    view.init(undefined, asyncContext);
    view.render();

    expect(buttonKinds).toEqual(['outline', 'solid']);
  });
});
