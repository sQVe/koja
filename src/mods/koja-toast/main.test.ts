import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  chainable,
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../tests/moduleFakes.ts';

interface RunCall {
  name: string;
  args: Record<string, unknown>;
}

type Call = { close: string | null } | RunCall;

let calls: Call[] = [];
let toastProps: Record<string, unknown> = {};
let cardClick: (() => void) | null = null;
let copyClick: ((event: unknown, cx: unknown) => void) | null = null;
let copyLabel: string | null = null;
let clipboard: string | null = null;
let stopCount = 0;
let notifyCount = 0;

const recordToastCard = (): unknown => {
  const element: Record<string, unknown> = {
    on_click: (handler: () => void) => {
      cardClick = handler;

      return element;
    },
  };

  return element;
};

const recordActionButton = (options: { label: string }): unknown => {
  copyLabel = options.label;

  const element: Record<string, unknown> = {
    on_click: (handler: (event: unknown, cx: unknown) => void) => {
      copyClick = handler;

      return element;
    },
  };

  return element;
};

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => chainable() }));

await mock.module('gpui-kit', () => gpuiKitFake());

await mock.module('herdr', () =>
  herdrFake({
    props: () => toastProps,
    run: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });

      return null;
    },
  }),
);

await mock.module('../../kit/index.ts', () =>
  kitIndexFake({
    actionButton: recordActionButton,
    closeOverlay: (id: string | null) => {
      calls.push({ close: id });
    },
    roleText: () => chainable(),
    toastCard: recordToastCard,
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

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  calls = [];
  cardClick = null;
  copyClick = null;
  copyLabel = null;
  clipboard = null;
  stopCount = 0;
  notifyCount = 0;

  toastProps = {
    title: 'Agent blocked',
    body: 'Needs your answer.',
    level: 'error',
    overlay: 'o3',
    action: { name: 'agent.focus', args: { terminal: 't3' } },
  };
});

const copyContext = {
  stop_propagation: () => {
    stopCount += 1;
  },
  write_to_clipboard: (text: string) => {
    clipboard = text;
  },
  notify: () => {
    notifyCount += 1;
  },
};

describe('toast', () => {
  test('runs the action and closes the toast on click', async () => {
    const view = await loadView();

    view.init(undefined, undefined);
    view.render();
    cardClick?.();

    expect(calls).toEqual([{ name: 'agent.focus', args: { terminal: 't3' } }, { close: 'o3' }]);
  });

  test('closes without running when there is no action', async () => {
    toastProps = { title: 'Update available', body: 'Restart to install.', overlay: 'o3' };
    const view = await loadView();

    view.init(undefined, undefined);
    view.render();
    cardClick?.();

    expect(calls).toEqual([{ close: 'o3' }]);
  });

  test('copies the login command and shows Copied', async () => {
    toastProps = {
      body: 'devbox needs login; run hc machine login devbox',
      overlay: 'o3',
      action: { name: 'agent.focus', args: { terminal: 't3' } },
    };

    const view = await loadView();

    view.init(undefined, undefined);
    view.render();
    copyClick?.({}, copyContext);
    view.render();

    expect(clipboard).toBe('hc machine login devbox');
    expect(copyLabel).toBe('Copied');
    expect(stopCount).toBe(1);
    expect(notifyCount).toBe(1);
    expect(calls).toEqual([]);
  });
});
