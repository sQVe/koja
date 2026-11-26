import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { createDeferred } from '../../../tests/deferred.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  click,
  clickablesWithText,
  drawn,
  elementsWithId,
  elementsWithStyle,
} from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { placeOf, worktreeOf } from '../../data/gitIdentity.ts';
import { heartbeatKey } from '../../data/lease.ts';
import type { Facts, PlaceGit, WorktreeGit } from '../../data/snapshot.ts';
import { snapshotKey, snapshotVersion } from '../../data/snapshot.ts';
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
  project: 'koja',
  tabId: 'k1',
  paneId: 'p1',
  agent: 'Claude Code',
  kind: 'permission',
  question: 'Allow this command?',
  command: 'bun run sandbox up',
  seq: 1,
};

const secondAsk: Ask = {
  identity: 't2:permission:bun run check',
  address: 't2',
  spaceId: 's2',
  spaceName: 'Hill-climb',
  project: 'tau',
  tabId: 'k3',
  paneId: 'p2',
  agent: 'Pi',
  kind: 'permission',
  question: 'Allow this command?',
  command: 'bun run check',
  seq: 2,
};

const rows = [
  { ask: secondAsk, age: '2m' },
  { ask, age: '5m' },
];

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
let sounds: string[] = [];
let timerHandler: (() => void) | null = null;
let readDeferred: { promise: Promise<string>; resolve: (value: string) => void } | null = null;
let readPaths: string[] = [];
let boundsValue = { state: 'windowed', bounds: [0, 0, 1280, 820] };

let spacesValue: Record<string, unknown>[] = [
  { id: 's1', folder: '/code/koja', tabs: [] },
  { id: 's2', folder: '/code/tau', tabs: [] },
];

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
    playSound: (sound: string) => {
      sounds.push(sound);

      return null;
    },
    props: () => propsValue,
    readTextFile: (path: string) => {
      readPaths.push(path);

      return readDeferred?.promise ?? Promise.resolve(JSON.stringify(boundsValue));
    },
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
    spaces: () => spacesValue,
    terminals: () => terminalsValue,
    theme: () => palette,
    window: () => ({ active: true, platform: 'linux' }),
  }),
);

const kitParts = [
  'button',
  'fields',
  'icon',
  'keycap',
  'layout',
  'normalRun',
  'overlay/card',
  'overlay/lines',
  'overlay/overlay',
  'size',
  'text',
  'textRole',
  'theme',
  'font',
  'timer',
  'window',
];

const kitFake = { ...(await realKitIndexFake(kitParts)), modName: 'koja-asks' };

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

// A live data snapshot whose Git facts name a linked worktree after its repository.
const seedGitFacts = (): void => {
  const main = {
    repository: {
      machine: null,
      commonDirectory: '/code/koja/.git',
      key: placeOf(null, '/code/koja/.git').key,
    },
    root: '/code/koja',
    branch: 'main',
    linked: false,
    bare: false,
  } satisfies WorktreeGit;

  const linked = {
    repository: {
      machine: null,
      commonDirectory: '/code/tau/.git',
      key: placeOf(null, '/code/tau/.git').key,
    },
    root: '/code/tau/feature',
    branch: 'me-1226-open-the-list',
    linked: true,
    bare: false,
  } satisfies WorktreeGit;

  const mainKey = worktreeOf(null, main.root).key;
  const linkedKey = worktreeOf(null, linked.root).key;

  const places: Record<string, PlaceGit> = {
    [placeOf(null, '/code/koja').key]: { kind: 'repository', worktree: mainKey },
    [placeOf(null, '/code/tau/feature').key]: { kind: 'repository', worktree: linkedKey },
  };

  const facts = {
    git: { places, worktrees: { [mainKey]: main, [linkedKey]: linked } },
    pulls: {},
    trackers: {},
    stacks: {},
  } satisfies Facts;

  values[snapshotKey] = { version: snapshotVersion, revision: 1, facts };
  values[heartbeatKey] = { version: 1, owner: 'koja-data', generation: 1, at: Date.now() };
};

const tick = async (): Promise<void> => {
  const handler = timerHandler;

  if (handler === null) {
    throw new Error('the ask host registered no timer');
  }

  handler();

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
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
  setSystemTime();
  focusedTab = 'k2';
  terminalsValue = [blockedTerminal];
  agentsValue = [agent];
  propsValue = {};
  values = {};
  opened = [];
  closed = [];
  runs = [];
  sounds = [];
  timerHandler = null;
  readDeferred = null;
  readPaths = [];
  boundsValue = { state: 'windowed', bounds: [0, 0, 1280, 820] };

  spacesValue = [
    { id: 's1', folder: '/code/koja', tabs: [] },
    { id: 's2', folder: '/code/tau', tabs: [] },
  ];
});

afterAll(() => {
  setSystemTime();
});

describe('the ask host', () => {
  test('opens one window card for an unseen permission ask', async () => {
    await runHost();

    expect(opened).toHaveLength(1);

    expect(opened[0]).toMatchObject({
      kind: 'window',
      frame: 'none',
      mod: 'koja-asks',
      width: 420,
      at: { x: 564 },
      props: {
        ask: {
          spaceName: 'Build window shell',
          agent: 'Claude Code',
          question: 'Allow this command?',
          command: 'bun run sandbox up',
        },
        normalMode: false,
      },
    });

    expect(readPaths).toEqual(['/home/test/.config/herdr-app/window.json']);
  });

  test('reopens the card taller with the jump hint when normal mode starts', async () => {
    await runHost();

    const insertHeight = Number(opened[0]?.['height']);

    expect(insertHeight).toBeGreaterThan(0);

    values['koja-modal'] = true;
    await tick();

    expect(opened).toHaveLength(2);
    expect(closed).toEqual(['overlay-1']);
    expect(opened[1]?.props).toMatchObject({ normalMode: true });

    const normalHeight = Number(opened[1]?.['height']);

    expect(normalHeight).toBeGreaterThan(insertHeight);
  });

  test('keeps one card when a second tick sees the same state', async () => {
    await runHost();
    await tick();

    expect(opened).toHaveLength(1);
    expect(sounds).toEqual(['blocked']);
  });

  test('reopens the card when the window bounds change', async () => {
    await runHost();

    boundsValue = { state: 'windowed', bounds: [0, 0, 1280, 1020] };
    await tick();

    expect(opened).toHaveLength(2);
    expect(closed).toEqual(['overlay-1']);
    expect(sounds).toEqual(['blocked']);
  });

  test('opens no card for an ask in the focused tab', async () => {
    focusedTab = 'k1';

    await runHost();

    expect(opened).toEqual([]);
    expect(sounds).toEqual([]);
  });

  test('plays no sound for a finished turn', async () => {
    terminalsValue = [{ ...blockedTerminal, report: { state: 'done', kind: null, msg: '' } }];

    await runHost();

    expect(opened).toEqual([]);
    expect(sounds).toEqual([]);
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

    const read = createDeferred<string>();

    readDeferred = read;
    timerHandler?.();
    await Promise.resolve();

    values['koja-asks.handled'] = [ask.identity];
    values['koja-asks.open'] = null;

    read.resolve(JSON.stringify({ state: 'windowed', bounds: [0, 0, 1280, 820] }));

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(opened).toEqual([]);

    expect(values['koja-asks.handled']).toEqual([ask.identity, 't2:permission:bun run check']);
  });

  test('opens the list of every unseen ask with its space, project, age, and command', async () => {
    const start = 1_700_000_000_000;

    setSystemTime(start);
    seedGitFacts();

    spacesValue = [
      { id: 's1', folder: '/code/koja', tabs: [] },
      { id: 's2', folder: '/code/tau/feature', tabs: [] },
    ];

    terminalsValue = [blockedTerminal, blockedTerminal2];
    agentsValue = [agent, agent2];

    await runHost();

    values['koja-asks.list'] = true;
    setSystemTime(start + 60_000);
    seedGitFacts();

    await tick();

    expect(opened).toHaveLength(2);

    expect(opened[1]?.props).toMatchObject({
      rows: [
        {
          ask: {
            address: 't2',
            spaceName: 'Hill-climb',
            question: 'Allow this command?',
            command: 'bun run check',
            project: 'tau',
          },
          age: '1m',
        },
        {
          ask: {
            address: 't1',
            spaceName: 'Build window shell',
            question: 'Allow this command?',
            command: 'bun run sandbox up',
            project: 'koja',
          },
          age: '1m',
        },
      ],
    });
  });

  test('lists a third unseen ask and skips a handled one', async () => {
    const thirdTerminal = {
      address: 't3',
      parent: null,
      labels: {},
      report: { state: 'blocked', kind: 'question', msg: 'Which judge?' },
    };

    const thirdAgent = { ...agent2, address: 't3', pane: 'p3', tab: 'k4', seq: 3 };

    terminalsValue = [blockedTerminal, blockedTerminal2, thirdTerminal];
    agentsValue = [agent, agent2, thirdAgent];
    values['koja-asks.handled'] = [secondAsk.identity];
    values['koja-asks.list'] = true;

    await runHost();

    const props = opened[0]?.props as { rows: { ask: { address: string } }[] } | undefined;

    expect(props?.rows.map((row) => row.ask.address)).toEqual(['t3', 't1']);
  });

  test('does not open a list for a new queue after every ask left', async () => {
    terminalsValue = [blockedTerminal, blockedTerminal2];
    agentsValue = [agent, agent2];
    values['koja-asks.list'] = true;

    await runHost();

    terminalsValue = [];
    await tick();

    expect(values['koja-asks.list']).toBeNull();

    terminalsValue = [blockedTerminal];
    opened = [];

    await tick();

    expect(opened[0]?.props).toMatchObject({ rows: null });
  });

  test('opens the list taller than the card', async () => {
    await runHost();

    const cardHeight = Number(opened[0]?.height);

    opened = [];
    closed = [];
    terminalsValue = [blockedTerminal, blockedTerminal2];
    agentsValue = [agent, agent2];
    values['koja-asks.list'] = true;

    await runHost();

    expect(Number(opened[0]?.height)).toBeGreaterThan(cardHeight);
  });

  test('opens the list with the same height and signature in normal mode and insert mode', async () => {
    terminalsValue = [blockedTerminal, blockedTerminal2];
    agentsValue = [agent, agent2];
    values['koja-asks.list'] = true;

    await runHost();

    const insertHeight = opened[0]?.['height'];
    const insertOpen = values['koja-asks.open'];

    opened = [];
    closed = [];
    values['koja-modal'] = true;

    await tick();

    expect(opened).toHaveLength(0);
    expect(closed).toHaveLength(0);
    expect(values['koja-asks.open']).toEqual(insertOpen);
    expect(insertHeight).toBeGreaterThan(0);
  });

  test('keeps the card when only one ask is unseen', async () => {
    values['koja-asks.list'] = true;

    await runHost();

    expect(opened[0]?.props).toMatchObject({ rows: null });
    expect(values['koja-asks.list']).toBeNull();
  });

  test('goes back to the card when one ask is answered', async () => {
    terminalsValue = [blockedTerminal, blockedTerminal2];
    agentsValue = [agent, agent2];
    values['koja-asks.list'] = true;

    await runHost();

    terminalsValue = [blockedTerminal];
    await tick();

    expect(opened).toHaveLength(2);
    expect(opened[1]?.props).toMatchObject({ rows: null });
    expect(values['koja-asks.list']).toBeNull();
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
  const initCard = (normalMode = false): { render: () => DrawnElement } => {
    propsValue = { ask, more: null, rows: null, normalMode, overlay: 'overlay-1' };

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

  test('the more line asks the host to open the list', () => {
    propsValue = { ask, more: { count: 1, space: 'Hill-climb' }, rows: null, overlay: 'overlay-1' };

    const view = new loaded.default();

    view.init(propsValue, context);

    const card = view.render();

    const more = elementsWithStyle(card, 'id').find(
      (part) => part.styles['id']?.[0] === 'koja-ask-more',
    );

    if (more !== undefined) {
      click(more);
    }

    expect(values['koja-asks.list']).toBe(true);
  });

  test('draws the jump hint only in normal mode', () => {
    values['koja-asks.open'] = { id: 'overlay-1', identity: ask.identity, signature: 'sig' };

    const normal = initCard(true).render();
    const insert = initCard().render();

    expect(elementsWithId(normal, 'koja-ask-hint')).toHaveLength(1);
    expect(elementsWithId(insert, 'koja-ask-hint')).toHaveLength(0);
  });

  test('the dismiss control marks the ask handled and closes without a jump', () => {
    values['koja-asks.open'] = { id: 'overlay-1', identity: ask.identity, signature: 'sig' };

    const view = initCard();
    const card = view.render();

    const dismiss = elementsWithId(card, 'koja-ask-dismiss')[0];

    if (dismiss !== undefined) {
      click(dismiss);
    }

    expect(runs).toEqual([]);
    expect(values['koja-asks.handled']).toEqual([ask.identity]);
    expect(closed).toEqual(['overlay-1']);
  });
});

describe('the ask list', () => {
  const initList = (): { render: () => DrawnElement } => {
    propsValue = { ask: secondAsk, more: null, rows, overlay: 'overlay-1' };

    const view = new loaded.default();

    view.init(propsValue, context);

    return view;
  };

  test('a click on a row goes to that ask, marks it handled, and closes the list', () => {
    values['koja-asks.open'] = { id: 'overlay-1', identity: secondAsk.identity, signature: 'sig' };
    values['koja-asks.list'] = true;

    const view = initList();
    const list = view.render();

    const row = clickablesWithText(list, 'Build window shell').at(-1);

    if (row !== undefined) {
      click(row);
    }

    expect(runs).toEqual([
      { name: 'space.select', args: { id: 's1' } },
      { name: 'tab.select', args: { id: 'k1' } },
      { name: 'pane.focus', args: { pane: 'p1' } },
    ]);

    expect(values['koja-asks.handled']).toEqual([ask.identity]);
    expect(values['koja-asks.list']).toBeNull();
    expect(values['koja-asks.open']).toBeNull();
    expect(closed).toEqual(['overlay-1']);
  });

  test('the dismiss control dismisses every ask without a jump', () => {
    values['koja-asks.open'] = { id: 'overlay-1', identity: secondAsk.identity, signature: 'sig' };
    values['koja-asks.list'] = true;

    const view = initList();
    const list = view.render();

    const dismiss = elementsWithStyle(list, 'id').find(
      (part) => part.styles['id']?.[0] === 'koja-ask-list-dismiss',
    );

    if (dismiss !== undefined) {
      click(dismiss);
    }

    expect(runs).toEqual([]);

    expect(values['koja-asks.handled']).toEqual([secondAsk.identity, ask.identity]);
    expect(values['koja-asks.list']).toBeNull();
    expect(closed).toEqual(['overlay-1']);
  });
});
