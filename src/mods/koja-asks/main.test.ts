import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../tests/drawn.ts';
import { click, drawn, elementsWithStyle } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import type { Ask } from './askFacts.ts';

const palette = {
  blocked: '#a81e26',
  border: '#b6bbc4',
  dim: '#43464e',
  foreground: '#1e2028',
  muted: '#383b43',
  popover: '#e6e8eb',
} as const;

const ask: Ask = {
  identity: 't1:permission:bun run sandbox up',
  address: 't1',
  spaceId: 's1',
  spaceName: 'Build window shell',
  tabId: 'k1',
  paneId: 'p1',
  agent: 'Claude Code',
  kind: 'permission',
  question: 'Allow this command?',
  command: 'bun run sandbox up',
  seq: 1,
};

const blockedTerminal = {
  address: 't1',
  parent: null,
  labels: {},
  report: { state: 'blocked', kind: 'permission', msg: 'bun run sandbox up' },
};

const blockedTerminal2 = {
  address: 't2',
  parent: null,
  labels: {},
  report: { state: 'blocked', kind: 'permission', msg: 'bun run check' },
};

const agent = {
  address: 't1',
  pane: 'p1',
  space: 's1',
  space_name: 'Build window shell',
  tab: 'k1',
  seq: 1,
  program: { name: 'Claude Code' },
};

const agent2 = {
  address: 't2',
  pane: 'p2',
  space: 's2',
  space_name: 'Hill-climb',
  tab: 'k3',
  seq: 2,
  program: { name: 'Pi' },
};

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolveValue!: (value: T) => void;

  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });

  return { promise, resolve: resolveValue };
};

const layout = {
  id: 'root',
  children: [
    { id: 'sidebar', size: { px: 268 }, children: [] },
    { id: 'work', children: [{ id: 'panel', size: { px: 368 }, hidden: true, children: [] }] },
  ],
};

let focusedTab = 'k2';
let terminalsValue: Record<string, unknown>[] = [blockedTerminal];
let agentsValue = [agent];
let propsValue: Record<string, unknown> = {};
let values: Record<string, unknown> = {};
let opened: Record<string, unknown>[] = [];
let closed: unknown[] = [];
let runs: { name: string; args: unknown }[] = [];
let timerHandler: (() => void) | null = null;
let readDeferred: { promise: Promise<string>; resolve: (value: string) => void } | null = null;

Object.assign(globalThis, { kojaModName: 'koja-asks' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({
    agents: () => agentsValue,
    appHome: () => '/home/test/.config/herdr-app',
    closeOverlay: (id: unknown) => {
      closed.push(id);

      return null;
    },
    focused: () => ({ tab: focusedTab }),
    layout: () => layout,
    openOverlay: (spec: Record<string, unknown>) => {
      opened.push(spec);

      return 'overlay-1';
    },
    props: () => propsValue,
    readTextFile: () =>
      readDeferred?.promise ??
      Promise.resolve(JSON.stringify({ state: 'windowed', bounds: [0, 0, 1280, 820] })),
    run: (name: string, args: unknown) => {
      runs.push({ name, args });

      return null;
    },
    setShared: (key: string, value: unknown) => {
      values[key] = value;

      return null;
    },
    settings: () => ({}),
    shared: (key: string) => values[key],
    terminals: () => terminalsValue,
    theme: () => palette,
    window: () => ({ active: true, platform: 'linux' }),
  }),
);

const kitParts = [
  'button',
  'fields',
  'icon',
  'layout',
  'modName',
  'overlay/card',
  'overlay/lines',
  'overlay/overlay',
  'size',
  'text',
  'textRole',
  'theme',
  'terminalFont',
  'timer',
  'window',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './main.ts';

const loaded = (await import(modulePath)) as {
  default: new () => {
    init: (props: unknown, cx: unknown) => void;
    render: () => DrawnElement;
  };
};

const context = {
  focus_handle: () => ({ focus: () => undefined, is_focused: () => false }),
  spawn: (body: (cx: unknown) => unknown) => {
    void body(context);
  },
  timer: {
    after: () => undefined,
    every: (_milliseconds: number, handler: (cx: unknown) => void) => {
      timerHandler = () => {
        handler(context);
      };
    },
  },
};

const tick = async (): Promise<void> => {
  timerHandler?.();

  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
};

const runHost = async (): Promise<void> => {
  const view = new loaded.default();

  view.init({}, context);

  await tick();
};

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  focusedTab = 'k2';
  terminalsValue = [blockedTerminal];
  agentsValue = [agent];
  propsValue = {};
  values = {};
  opened = [];
  closed = [];
  runs = [];
  timerHandler = null;
  readDeferred = null;
});

describe('the ask host', () => {
  test('opens one window card for an unseen permission ask', async () => {
    await runHost();

    expect(opened).toHaveLength(1);

    expect(opened[0]).toMatchObject({
      kind: 'window',
      frame: 'none',
      mod: 'koja-asks',
      props: {
        ask: {
          spaceName: 'Build window shell',
          agent: 'Claude Code',
          question: 'Allow this command?',
          command: 'bun run sandbox up',
        },
      },
    });
  });

  test('opens no card for an ask in the focused tab', async () => {
    focusedTab = 'k1';

    await runHost();

    expect(opened).toEqual([]);
  });

  test('opens no card for an ask the user already dismissed', async () => {
    values['koja-asks.handled'] = [ask.identity];

    await runHost();

    expect(opened).toEqual([]);
  });

  test('names the next unseen ask in the card props', async () => {
    terminalsValue = [blockedTerminal, blockedTerminal2];
    agentsValue = [agent, agent2];

    await runHost();

    expect(opened[0]?.props).toMatchObject({
      more: { count: 1, space: 'Build window shell' },
    });
  });

  test('does not count a handled ask in the more line', async () => {
    terminalsValue = [blockedTerminal, blockedTerminal2];
    agentsValue = [agent, agent2];
    values['koja-asks.handled'] = [ask.identity];

    await runHost();

    expect(opened[0]?.props).toMatchObject({ more: null });
  });

  test('closes the card when the ask is answered', async () => {
    await runHost();

    terminalsValue = [{ ...blockedTerminal, report: { state: 'working', kind: null, msg: '' } }];

    await tick();

    expect(closed).toEqual(['overlay-1']);
    expect(values['koja-asks.open']).toBeNull();
  });

  test('keeps a dismissal made while the window bounds are read', async () => {
    terminalsValue = [blockedTerminal, blockedTerminal2];
    agentsValue = [agent, agent2];
    focusedTab = 'k3';

    const view = new loaded.default();

    view.init({}, context);

    const read = deferred<string>();

    readDeferred = read;
    timerHandler?.();
    await Promise.resolve();

    values['koja-asks.handled'] = [ask.identity];
    values['koja-asks.open'] = null;

    read.resolve(JSON.stringify({ state: 'windowed', bounds: [0, 0, 1280, 820] }));

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(opened).toEqual([]);

    expect(values['koja-asks.handled']).toEqual([ask.identity, 't2:permission:bun run check']);
  });

  test('does not reopen an ask the user saw in its tab', async () => {
    await runHost();

    expect(opened).toHaveLength(1);

    focusedTab = 'k1';
    await tick();

    focusedTab = 'k2';
    await tick();

    expect(opened).toHaveLength(1);
    expect(values['koja-asks.handled']).toEqual([ask.identity]);
  });
});

describe('the ask card', () => {
  const initCard = (): { render: () => DrawnElement } => {
    propsValue = { ask, more: null, overlay: 'overlay-1' };

    const view = new loaded.default();

    view.init(propsValue, context);

    return view;
  };

  test('a click goes to the asking pane, marks the ask handled, and closes the card', () => {
    values['koja-asks.open'] = { id: 'overlay-1', identity: ask.identity, signature: 'sig' };

    const view = initCard();
    const card = view.render();
    const clickable = elementsWithStyle(card, 'cursor_pointer')[0];

    if (clickable !== undefined) {
      click(clickable);
    }

    expect(runs).toEqual([
      { name: 'space.select', args: { id: 's1' } },
      { name: 'tab.select', args: { id: 'k1' } },
      { name: 'pane.focus', args: { pane: 'p1' } },
    ]);

    expect(values['koja-asks.handled']).toEqual([ask.identity]);
    expect(values['koja-asks.open']).toBeNull();
    expect(closed).toEqual(['overlay-1']);
  });

  test('the dismiss control marks the ask handled and closes without a jump', () => {
    values['koja-asks.open'] = { id: 'overlay-1', identity: ask.identity, signature: 'sig' };

    const view = initCard();
    const card = view.render();

    const dismiss = elementsWithStyle(card, 'id').find(
      (part) => part.styles['id']?.[0] === 'koja-ask-dismiss',
    );

    if (dismiss !== undefined) {
      click(dismiss);
    }

    expect(runs).toEqual([]);
    expect(values['koja-asks.handled']).toEqual([ask.identity]);
    expect(closed).toEqual(['overlay-1']);
  });
});
