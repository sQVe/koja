import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

interface RunCall {
  name: string;
  args: Record<string, unknown>;
}

type Call = { close: string | null } | RunCall;

let calls: Call[] = [];
let toastProps: Record<string, unknown> = {};
let cardClick: (() => void) | null = null;

const recordToastCard = (): unknown => {
  const element: Record<string, unknown> = {
    on_click: (handler: () => void) => {
      cardClick = handler;

      return element;
    },
  };

  return element;
};

await mock.module('gpui-base', () => gpuiBaseFake());

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
    closeOverlay: (id: string | null) => {
      calls.push({ close: id });
    },
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

  toastProps = {
    title: 'Agent blocked',
    body: 'Needs your answer.',
    level: 'error',
    overlay: 'o3',
    action: { name: 'agent.focus', args: { terminal: 't3' } },
  };
});

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
});
