import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import {
  drawn,
  drawnTexts,
  elementsWithBorder,
  elementsWithSizeHandler,
} from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

interface FakeView {
  init: (props: unknown, cx: unknown) => void;
  render: () => DrawnElement;
}

const themeColors = {
  accent: '#0a0a0a',
  foreground: '#111111',
  muted: '#222222',
  selected: '#333333',
  border: '#444444',
  hover: '#555555',
  dim: '#666666',
  blocked: '#777777',
  chrome: '#888888',
};

const rowHeightSmall = 24;

let runCalls: RunCall[] = [];
let notifyCalls = 0;
let sharedValues: Record<string, unknown> = {};
let sidebarWidth: number | null = null;
let spaceList: SpaceInfo[] = [];
const commandQueue: string[] = [];
const commandWaiters: ((command: string) => void)[] = [];

const nextCommand = (): Promise<string> => {
  const queued = commandQueue.shift();

  if (queued !== undefined) {
    return Promise.resolve(queued);
  }

  return new Promise((resolve) => {
    commandWaiters.push(resolve);
  });
};

const deliverCommand = (command: string): void => {
  const waiter = commandWaiters.shift();

  if (waiter !== undefined) {
    waiter(command);

    return;
  }

  commandQueue.push(command);
};

const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const space = (id: string, active: boolean): SpaceInfo => ({
  id,
  index: 1,
  name: `name-${id}`,
  named: true,
  folder: '',
  machine: null,
  branch: null,
  active,
  status: null,
  tabs: [],
});

class HostView {
  render(): unknown {
    return null;
  }
}

const store = new Map<string, string>();

Object.assign(globalThis, {
  kojaModName: 'koja',
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  },
});

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path), View: HostView }),
);

await mock.module('herdr', () =>
  herdrFake({
    layout: () => ({ id: 'sidebar', size: { px: sidebarWidth } }),
    nextCommand,
    run: (command: string, args?: Record<string, unknown>) => {
      runCalls.push({ command, args });

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => spaceList,
    theme: () => themeColors,
  }),
);

const { railWidthLimit } = await import('../../kit/size.ts');
const { writeSection } = await import('../../kit/section.ts');

const kitModule = async (name: string): Promise<Record<string, unknown>> =>
  (await import(`../../kit/${name}.ts`)) as Record<string, unknown>;

const kitParts = [
  'button',
  'hoverTarget',
  'icon',
  'layout',
  'listRow',
  'repoLabel',
  'section',
  'sectionHeader',
  'size',
  'stateLine',
  'statusMark',
  'statusRollup',
  'text',
  'textRole',
  'theme',
];

const kitExports = Object.assign({}, ...(await Promise.all(kitParts.map(kitModule)))) as Record<
  string,
  unknown
>;

const sharedNames = new Set(Object.keys(kitIndexFake()));

const realKit = Object.fromEntries(
  Object.entries(kitExports).filter(([name]) => sharedNames.has(name)),
);

await mock.module('../../kit/index.ts', () => kitIndexFake(realKit));

const mark = (section: 'sidebar' | 'panes'): void => {
  writeSection((key, value) => {
    sharedValues[key] = value;
  }, section);
};

const loadView = async (): Promise<FakeView> => {
  const modulePath = './main.ts';
  const loaded = (await import(modulePath)) as { default: new () => FakeView };
  const view = new loaded.default();

  const context = {
    notify: () => {
      notifyCalls += 1;
    },
    spawn: (body: (cx: unknown) => Promise<void>) => {
      body(context).catch(() => undefined);
    },
    timer: { every: () => undefined },
  };

  view.init({}, context);
  view.render();

  return view;
};

const cursorNames = (view: FakeView): string[] =>
  elementsWithBorder(view.render(), themeColors.accent).flatMap(drawnTexts);

const send = async (command: string): Promise<void> => {
  deliverCommand(command);

  await flush();
};

const redrawsOf = async (command: string): Promise<number> => {
  await flush();

  const before = notifyCalls;

  await send(command);

  return notifyCalls - before;
};

const selected = (): unknown[] =>
  runCalls.filter((call) => call.command === 'space.select').map((call) => call.args?.['id']);

const reportHeight = (view: FakeView, height: number): void => {
  for (const element of elementsWithSizeHandler(view.render())) {
    element.sizeHandlers[0]?.({ width: 200, height }, {});
  }
};

beforeEach(() => {
  runCalls = [];
  notifyCalls = 0;
  sharedValues = {};
  sidebarWidth = null;
  commandQueue.length = 0;
  commandWaiters.length = 0;
  spaceList = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => space(id, id === 'b'));
  mark('sidebar');
});

afterAll(() => {
  mock.restore();
});

describe('koja-spaces list cursor', () => {
  test('list-down followed by list-open selects the space after the active one', async () => {
    await loadView();

    await send('list-down');
    await send('list-open');

    expect(selected()).toEqual(['c']);
  });

  test('a marked sidebar outlines the active space before any list key', async () => {
    const view = await loadView();

    expect(cursorNames(view)).toEqual(['name-b']);
  });

  test('a sidebar that is not marked outlines no row', async () => {
    mark('panes');

    const view = await loadView();

    expect(cursorNames(view)).toEqual([]);
  });

  test('a list command moves the outline and asks for a redraw', async () => {
    const view = await loadView();

    expect(await redrawsOf('list-last')).toBe(1);
    expect(cursorNames(view)).toEqual(['name-h']);
  });

  test('a list command does nothing while the sidebar is not marked', async () => {
    mark('panes');

    await loadView();
    await send('list-open');

    expect(selected()).toEqual([]);
  });

  test('a command that is not a list command does nothing', async () => {
    await loadView();

    expect(await redrawsOf('unknown')).toBe(0);
    expect(selected()).toEqual([]);
  });

  test('the cursor starts from the active space again after the mark drops', async () => {
    const view = await loadView();

    await send('list-last');
    mark('panes');
    view.render();
    mark('sidebar');

    expect(cursorNames(view)).toEqual(['name-b']);

    await send('list-open');

    expect(selected()).toEqual(['b']);
  });

  test('a cursor whose space closed moves the outline to the active space', async () => {
    const view = await loadView();

    await send('list-last');
    spaceList = spaceList.filter((candidate) => candidate.id !== 'h');

    expect(cursorNames(view)).toEqual(['name-b']);
  });

  test('half a page is one row before the list reports its size', async () => {
    await loadView();

    await send('list-half-page-down');
    await send('list-open');

    expect(selected()).toEqual(['c']);
  });

  test('half a page is half the rows that fit in the reported height', async () => {
    const view = await loadView();

    reportHeight(view, rowHeightSmall * 6);
    await send('list-half-page-down');
    await send('list-open');

    expect(selected()).toEqual(['e']);
  });

  test('the collapsed rail outlines the cursor row', async () => {
    sidebarWidth = railWidthLimit - 1;

    const view = await loadView();
    const outlined = elementsWithBorder(view.render(), themeColors.accent);

    expect(outlined.map((element) => element.tooltipText)).toEqual(['name-b']);
  });
});
