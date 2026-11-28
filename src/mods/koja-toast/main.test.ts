import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, clickablesWithText, drawn, drawnTexts } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';

interface RunCall {
  name: string;
  args: Record<string, unknown>;
}

type Call = { close: string | null } | RunCall;

const palette = {
  accent: '#ff00aa',
  blocked: '#c0392b',
  border: '#999ca7',
  dim: '#525460',
  done: '#1f8f4e',
  foreground: '#1e2028',
  hover: '#e6e8eb',
  muted: '#3a3d4c',
  popover: '#dcdee5',
  raised: '#e6e8eb',
  solid: '#1e2028',
  solid_foreground: '#dcdee5',
  working: '#b7791f',
} as const;

let calls: Call[] = [];
let toastProps: Record<string, unknown> = {};
let clipboard: string | null = null;
let stopCount = 0;
let notifyCount = 0;

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

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), image: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({
    closeOverlay: (id: string | null) => {
      calls.push({ close: id });

      return null;
    },
    props: () => toastProps,
    run: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });

      return null;
    },
    theme: () => palette,
  }),
);

const kitFake = await realKitIndexFake(['button', 'overlay/overlay', 'size', 'textRole', 'toast']);

await mock.module('../../kit/index.ts', () => kitFake);

const loadView = async (): Promise<{
  init: (props: unknown, cx: unknown) => void;
  render: () => DrawnElement;
}> => {
  const modulePath = './main.ts';

  const loaded = (await import(modulePath)) as {
    default: new () => {
      init: (props: unknown, cx: unknown) => void;
      render: () => DrawnElement;
    };
  };

  return new loaded.default();
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  calls = [];
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

describe('toast', () => {
  test('runs the action and closes the toast on click', async () => {
    const view = await loadView();

    view.init(undefined, undefined);
    click(view.render());

    expect(calls).toEqual([{ name: 'agent.focus', args: { terminal: 't3' } }, { close: 'o3' }]);
  });

  test('closes without running when there is no action', async () => {
    toastProps = { title: 'Update available', body: 'Restart to install.', overlay: 'o3' };
    const view = await loadView();

    view.init(undefined, undefined);
    click(view.render());

    expect(calls).toEqual([{ close: 'o3' }]);
  });

  test('draws a plain title and a fitted multiline body', async () => {
    const body = 'typecheck exited with code 1.\nFix the type error and rerun.';

    toastProps = { title: 'Build failed', body, fitHeight: true, overlay: 'o3' };

    const view = await loadView();

    view.init(undefined, undefined);

    const texts = drawnTexts(view.render());

    expect(texts).toContain('Build failed');
    expect(texts).toContain(body);
  });

  test('copies the login command and shows Copied', async () => {
    toastProps = {
      body: 'devbox needs login; run hc machine login devbox',
      overlay: 'o3',
      action: { name: 'agent.focus', args: { terminal: 't3' } },
    };

    const view = await loadView();

    view.init(undefined, undefined);

    const card = view.render();
    const copy = clickablesWithText(card, 'Copy').find((part) => part !== card);

    expect(drawnTexts(card)).toContain('hc machine login devbox');

    if (copy === undefined) {
      throw new Error('The toast draws no Copy button.');
    }

    click(copy, copyContext);

    const rerendered = view.render();

    expect(clipboard).toBe('hc machine login devbox');
    expect(drawnTexts(rerendered)).toContain('Copied');
    expect(stopCount).toBe(1);
    expect(notifyCount).toBe(1);
    expect(calls).toEqual([]);
  });
});
