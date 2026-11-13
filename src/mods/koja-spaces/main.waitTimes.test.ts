import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import type { PaneInfo, SpaceInfo, Status } from 'herdr';

import { drawn, drawnTexts } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';

interface FakeView {
  init: (props: unknown, cx: unknown) => void;
  render: () => DrawnElement;
}

interface Timer {
  milliseconds: number;
  handler: (cx: unknown) => void;
}

const minute = 60_000;

const start = new Date('2026-11-13T09:00:00Z').getTime();

const ageWord = /^(?:now|\d+[mhdw])$/;

let spaceList: SpaceInfo[] = [];
let paneList: PaneInfo[] = [];
let timers: Timer[] = [];
let notifyCalls = 0;
let writes: string[] = [];
const store = new Map<string, string>();

const space = (id: string, active: boolean): SpaceInfo => ({
  id,
  index: 1,
  name: `name-${id}`,
  named: true,
  folder: '/code/notes',
  machine: null,
  branch: null,
  active,
  status: null,
  tabs: [
    {
      id: `tab-${id}`,
      index: 1,
      name: '1',
      named: false,
      active: true,
      status: null,
      panes: 1,
      zoomed: false,
      settled: false,
      settled_at: null,
      changed_at: null,
      working_since: null,
    },
  ],
});

const pane = (id: string, status: Status | null): PaneInfo => ({
  pane: `pane-${id}`,
  terminal: `terminal-${id}`,
  tab: `tab-${id}`,
  title: id,
  cwd: '/code/notes',
  branch: null,
  status,
  app: null,
  program: {
    key: 'agent',
    name: 'Agent',
    icon: null,
    tint: false,
    tile: null,
    color: null,
    shell: false,
    agent: true,
  },
  focused: false,
  zoomed: false,
  movable: false,
});

const showSpaces = (statuses: Record<string, Status | null>, active: string): void => {
  spaceList = Object.keys(statuses).map((id) => space(id, id === active));
  paneList = Object.entries(statuses).map(([id, status]) => pane(id, status));
};

Object.assign(globalThis, {
  kojaModName: 'koja',
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      store.set(key, value);
    },
  },
});

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({
    div: () => drawn(),
    svg: (path: string) => drawn(path),
    View: class {
      render(): unknown {
        return null;
      }
    },
  }),
);

await mock.module('herdr', () =>
  herdrFake({
    panes: () => paneList,
    spaces: () => spaceList,
    theme: () => ({}),
  }),
);

const kitParts = [
  'button',
  'hoverTarget',
  'icon',
  'layout',
  'listRow',
  'projectHeader',
  'section',
  'sectionHeader',
  'size',
  'stateLine',
  'statusMark',
  'statusRollup',
  'text',
  'textRole',
  'theme',
  'timer',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

const context = {
  notify: () => {
    notifyCalls += 1;
  },
  spawn: () => undefined,
  timer: {
    every: (milliseconds: number, handler: (cx: unknown) => void) => {
      timers.push({ milliseconds, handler });
    },
  },
};

const loadView = async (): Promise<FakeView> => {
  const modulePath = './main.ts';
  const loaded = (await import(modulePath)) as { default: new () => FakeView };
  const view = new loaded.default();

  view.init({}, context);

  return view;
};

const fastestTimer = (): Timer => {
  const fastest = timers.toSorted((left, right) => left.milliseconds - right.milliseconds)[0];

  if (fastest === undefined) {
    throw new Error('the view started no timer');
  }

  return fastest;
};

const checkAt = (time: number): void => {
  setSystemTime(time);
  fastestTimer().handler(context);
};

const ageOf = (view: FakeView, id: string): string | null => {
  const texts = drawnTexts(view.render());
  const next = texts[texts.indexOf(`name-${id}`) + 1] ?? '';

  return ageWord.test(next) ? next : null;
};

beforeEach(() => {
  timers = [];
  notifyCalls = 0;
  writes = [];
  store.clear();
  setSystemTime(start);
});

afterAll(() => {
  setSystemTime();
  mock.restore();
});

describe('koja-spaces wait ages', () => {
  test('a blocked space shows the age since it became blocked, and none once it works', async () => {
    showSpaces({ a: 'blocked', b: null }, 'b');

    const view = await loadView();

    checkAt(start);
    checkAt(start + 2 * minute);
    setSystemTime(start + 5 * minute);

    expect(ageOf(view, 'a')).toBe('5m');

    showSpaces({ a: 'working', b: null }, 'b');
    checkAt(start + 6 * minute);

    expect(ageOf(view, 'a')).toBeNull();
  });

  test('an idle space shows the age since the user last showed it, and the shown one none', async () => {
    showSpaces({ a: 'idle', b: 'idle' }, 'a');

    const view = await loadView();

    checkAt(start);
    checkAt(start + minute);
    showSpaces({ a: 'idle', b: 'idle' }, 'b');
    checkAt(start + minute + 250);
    setSystemTime(start + 4 * minute);

    expect(ageOf(view, 'a')).toBe('3m');
    expect(ageOf(view, 'b')).toBeNull();
  });

  test('both ages are still drawn after the mod starts again from its saved times', async () => {
    showSpaces({ a: 'blocked', b: 'idle', c: null }, 'b');
    await loadView();
    checkAt(start);
    showSpaces({ a: 'blocked', b: 'idle', c: null }, 'c');
    checkAt(start + 250);

    timers = [];
    setSystemTime(start + 10 * minute);

    const restarted = await loadView();

    checkAt(start + 10 * minute);

    expect(ageOf(restarted, 'a')).toBe('10m');
    expect(ageOf(restarted, 'b')).toBe('10m');
  });

  test('saves at once on a change, and otherwise at most once a minute', async () => {
    showSpaces({ a: 'blocked', b: null }, 'b');
    await loadView();
    checkAt(start);

    const first = writes.length;

    checkAt(start + 30_000);

    const quiet = writes.length;

    showSpaces({ a: 'working', b: null }, 'b');
    checkAt(start + 31_000);

    const changed = writes.length;

    showSpaces({ a: 'working', b: null }, 'a');
    checkAt(start + 32_000);

    const shown = writes.length;

    checkAt(start + 92_000);

    expect([first, quiet, changed, shown, writes.length]).toEqual([1, 1, 2, 3, 4]);
  });

  test('a time that passes with no change redraws within a minute', async () => {
    showSpaces({ a: 'blocked', b: null }, 'b');
    await loadView();
    checkAt(start);

    const before = notifyCalls;

    for (const timer of timers.filter((candidate) => candidate.milliseconds <= minute)) {
      timer.handler(context);
    }

    expect(notifyCalls).toBeGreaterThan(before);
  });
});
