import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  click,
  clickablesWithText,
  descendants,
  drawn,
  drawnTexts,
  elementWithIcon,
} from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { handledAsksKey } from '../../data/asks.ts';

interface RunCall {
  name: string;
  args: Record<string, unknown>;
}

type Call = { close: string | null } | RunCall;

interface TimerTask {
  cancel: () => void;
}

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
let sharedValues: Record<string, unknown> = {};
let terminalsValue: Record<string, unknown>[] = [];
let agentsValue: Record<string, unknown>[] = [];
let focusedTab: string | null = 'k2';
let windowActive = true;
let checkingValue = false;
let timerMilliseconds: number | null = null;
let timerHandler: ((cx: unknown) => void) | null = null;
let timerCancelled = false;
let tickNotifyCount = 0;

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
  gpuiKitFake({
    div: () => drawn(),
    image: (path: string) => drawn(path, 'image'),
    svg: (path: string) => drawn(path, 'svg'),
  }),
);

await mock.module('herdr', () =>
  herdrFake({
    agents: () => agentsValue,
    checking: () => checkingValue,
    closeOverlay: (id: string | null) => {
      calls.push({ close: id });

      return null;
    },
    focused: () => (focusedTab === null ? null : { tab: focusedTab }),
    props: () => toastProps,
    run: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });

      return null;
    },
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;

      return null;
    },
    shared: (key: string) => sharedValues[key],
    terminals: () => terminalsValue,
    theme: () => palette,
    window: () => ({ active: windowActive, platform: 'linux' }),
  }),
);

const { overlayCloseCount } = await import('../../kit/overlay/open.ts');

const kitFake = await realKitIndexFake([
  'button',
  'fields',
  'overlay/open',
  'overlay/overlay',
  'size',
  'textRole',
  'timer',
  'toast',
  'window',
]);

await mock.module('../../kit/index.ts', () => kitFake);

const renderContext = {
  notify: () => {
    tickNotifyCount += 1;
  },
  timer: {
    every: (milliseconds: number, handler: (cx: unknown) => void): TimerTask => {
      timerMilliseconds = milliseconds;
      timerHandler = handler;

      return {
        cancel: () => {
          timerCancelled = true;
        },
      };
    },
  },
};

const runTimer = (): void => {
  const handler = timerHandler;

  if (handler === null) {
    throw new Error('the toast registered no timer');
  }

  handler(renderContext);
};

const loadView = async (): Promise<{
  init: (props: unknown, cx: unknown) => void;
  render: (cx: unknown) => DrawnElement;
}> => {
  const modulePath = './main.ts';

  const loaded = (await import(modulePath)) as {
    default: new () => {
      init: (props: unknown, cx: unknown) => void;
      render: (cx: unknown) => DrawnElement;
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
  sharedValues = {};
  terminalsValue = [];
  agentsValue = [];
  focusedTab = 'k2';
  windowActive = true;
  checkingValue = false;
  timerMilliseconds = null;
  timerHandler = null;
  timerCancelled = false;
  tickNotifyCount = 0;

  toastProps = {
    title: 'Agent blocked',
    body: 'Needs your answer.',
    level: 'error',
    overlay: 'o3',
    action: { name: 'agent.focus', args: { terminal: 't3' } },
  };
});

describe('toast', () => {
  test('closes the toast, then runs the action on click', async () => {
    const view = await loadView();

    view.init(undefined, renderContext);
    click(view.render(renderContext));

    expect(calls).toEqual([{ close: 'o3' }, { name: 'agent.focus', args: { terminal: 't3' } }]);
    expect(overlayCloseCount()).toBe(1);
  });

  test('closes without running when there is no action', async () => {
    toastProps = { title: 'Update available', body: 'Restart to install.', overlay: 'o3' };
    const view = await loadView();

    view.init(undefined, renderContext);
    click(view.render(renderContext));

    expect(calls).toEqual([{ close: 'o3' }]);
  });

  test('colors the mark for the notification level', async () => {
    toastProps = {
      title: 'Checks are stale',
      body: 'The last check ran 8 minutes ago.',
      level: 'warning',
      overlay: 'o3',
    };

    const view = await loadView();

    view.init(undefined, renderContext);

    const backgrounds = descendants(view.render(renderContext)).flatMap(
      (part) => part.backgroundColors,
    );

    expect(backgrounds).toContain(palette.working);
    expect(backgrounds).not.toContain(palette.accent);
  });

  test('draws the host icon as an untinted image with its path', async () => {
    toastProps = {
      title: 'Agent blocked',
      body: 'Needs your answer.',
      icon: 'icons/agent.svg',
      overlay: 'o3',
    };

    const view = await loadView();

    view.init(undefined, renderContext);

    const glyph = elementWithIcon(view.render(renderContext), 'agent.svg');

    expect(glyph?.kind).toBe('image');
    expect(glyph?.path).toBe('icons/agent.svg');
  });

  test('draws a plain title and a fitted multiline body', async () => {
    const body = 'typecheck exited with code 1.\nFix the type error and rerun.';

    toastProps = { title: 'Build failed', body, fitHeight: true, overlay: 'o3' };

    const view = await loadView();

    view.init(undefined, renderContext);

    const texts = drawnTexts(view.render(renderContext));

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

    view.init(undefined, renderContext);

    const card = view.render(renderContext);
    const copy = clickablesWithText(card, 'Copy').find((part) => part !== card);

    const title = drawnTexts(card).find(
      (text) => text.includes('devbox') && text !== 'hc machine login devbox',
    );

    expect(title).toBeDefined();
    expect(drawnTexts(card)).toContain('hc machine login devbox');

    if (copy === undefined) {
      throw new Error('The toast draws no Copy button.');
    }

    click(copy, copyContext);

    const rerendered = view.render(renderContext);
    const copied = clickablesWithText(rerendered, 'Copied').filter((part) => part !== rerendered);
    const stillCopy = clickablesWithText(rerendered, 'Copy').filter((part) => part !== rerendered);

    expect(clipboard).toBe('hc machine login devbox');
    expect(copied).toHaveLength(1);
    expect(stillCopy).toEqual([]);
    expect(stopCount).toBe(1);
    expect(notifyCount).toBe(1);
    expect(calls).toEqual([]);
  });

  const blockedTerminal = {
    address: 't3',
    parent: null,
    labels: {},
    turn: 1,
    report: { state: 'blocked', kind: 'permission', msg: 'bun run up' },
  };

  const agent = {
    address: 't3',
    pane: 'p3',
    space: 's1',
    space_name: 'Build window shell',
    tab: 'k1',
    seq: 1,
    program: { name: 'Claude Code' },
  };

  const doneTerminal = {
    ...blockedTerminal,
    report: { state: 'done', kind: null, msg: '' },
  };

  test('closes a matching toast once and draws nothing', async () => {
    terminalsValue = [blockedTerminal];
    agentsValue = [agent];

    const view = await loadView();

    view.init(undefined, renderContext);

    expect(calls).toEqual([{ close: 'o3' }]);
    expect(timerHandler).toBeNull();
    expect(drawnTexts(view.render(renderContext))).toEqual([]);
    expect(drawnTexts(view.render(renderContext))).toEqual([]);
    expect(calls).toEqual([{ close: 'o3' }]);
  });

  test('draws a finished toast', async () => {
    terminalsValue = [doneTerminal];
    agentsValue = [agent];

    const view = await loadView();

    view.init(undefined, renderContext);

    const card = view.render(renderContext);

    expect(drawnTexts(card)).toContain('Agent blocked');
    expect(calls).toEqual([]);
  });

  test('keeps the toast when the ask is in the focused tab', async () => {
    terminalsValue = [blockedTerminal];
    agentsValue = [agent];
    focusedTab = 'k1';

    const view = await loadView();

    view.init(undefined, renderContext);

    const card = view.render(renderContext);

    expect(drawnTexts(card)).toContain('Agent blocked');
    expect(calls).toEqual([]);
  });

  test('hides the toast when no tab is focused', async () => {
    terminalsValue = [blockedTerminal];
    agentsValue = [agent];
    focusedTab = null;

    const view = await loadView();

    view.init(undefined, renderContext);

    const card = view.render(renderContext);

    expect(drawnTexts(card)).toEqual([]);
    expect(calls).toEqual([{ close: 'o3' }]);
  });

  test('hides the toast when the ask is in the focused tab and the window is not active', async () => {
    terminalsValue = [blockedTerminal];
    agentsValue = [agent];
    focusedTab = 'k1';
    windowActive = false;

    const view = await loadView();

    view.init(undefined, renderContext);

    const card = view.render(renderContext);

    expect(drawnTexts(card)).toEqual([]);
    expect(calls).toEqual([{ close: 'o3' }]);
  });

  test('keeps the toast for an ask the card already handled', async () => {
    terminalsValue = [blockedTerminal];
    agentsValue = [agent];
    sharedValues[handledAsksKey] = ['t3:1:permission:bun run up'];

    const view = await loadView();

    view.init(undefined, renderContext);

    const card = view.render(renderContext);

    expect(drawnTexts(card)).toContain('Agent blocked');
    expect(calls).toEqual([]);
  });

  test('skips the re-check while Herdr checks the mod', async () => {
    checkingValue = true;

    const view = await loadView();

    view.init(undefined, renderContext);

    expect(timerHandler).toBeNull();
    expect(drawnTexts(view.render(renderContext))).toContain('Agent blocked');
  });

  test('closes a toast that matches on a later render', async () => {
    terminalsValue = [{ ...blockedTerminal, report: { state: 'working', kind: null, msg: '' } }];
    agentsValue = [agent];

    const view = await loadView();

    view.init(undefined, renderContext);

    expect(timerMilliseconds).toBe(100);
    expect(tickNotifyCount).toBe(0);
    expect(drawnTexts(view.render(renderContext))).toContain('Agent blocked');
    expect(calls).toEqual([]);

    terminalsValue = [blockedTerminal];
    runTimer();

    expect(calls).toEqual([{ close: 'o3' }]);
    expect(tickNotifyCount).toBe(1);
    expect(timerCancelled).toBe(true);
    expect(drawnTexts(view.render(renderContext))).toEqual([]);
  });
});
