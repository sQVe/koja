import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import {
  clickablesWithText,
  drawn,
  drawnTexts,
  elementsWithBorder,
  elementsWithMouseHandlers,
  elementsWithSizeHandler,
  press,
} from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';
import type { GitInfo } from './tree.ts';

type MouseHandler = (event: unknown, cx: unknown) => void;

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
let scrollCalls: number[] = [];
let sharedValues: Record<string, unknown> = {};
let sidebarWidth: number | null = null;
let spaceList: SpaceInfo[] = [];
let gitByFolder: Record<string, GitInfo> = {};
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

const space = (id: string, active: boolean, folder = '/code/notes'): SpaceInfo => ({
  id,
  index: 1,
  name: `name-${id}`,
  named: true,
  folder,
  machine: null,
  branch: null,
  active,
  status: null,
  tabs: [],
});

// Answers as the tracker would once git ran in each folder.
class FakeGitTracker {
  entries(): Record<string, GitInfo> {
    return {};
  }

  lookup(key: string): GitInfo | undefined {
    const [, folder] = JSON.parse(key) as [string | null, string];

    return gitByFolder[folder];
  }

  repositories(): [] {
    return [];
  }

  sweep(): Set<string> {
    return new Set();
  }

  prune(): void {
    return undefined;
  }

  refresh(): void {
    return undefined;
  }
}

const checkoutOf = (folder: string, linked: boolean): GitInfo => ({
  branch: 'main',
  repo: repositoryOf(null, '/code/koja/.git'),
  root: folder,
  cwd: folder,
  linked,
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
  gpuiBaseFake({
    h_flex: () => drawn(),
    v_flex: () => drawn(),
    ScrollHandle: {
      new: () => ({
        scroll_to_item: (index: number) => {
          scrollCalls.push(index);
        },
      }),
    },
  }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path), View: HostView }),
);

await mock.module('./gitTracker.ts', () => ({ GitTracker: FakeGitTracker }));

await mock.module('herdr', () =>
  herdrFake({
    layout: () => ({ id: 'sidebar', size: { px: sidebarWidth } }),
    nextCommand,
    run: (command: string, args?: Record<string, unknown>) => {
      runCalls.push({ command, args });

      return null;
    },
    setShared: (key: string, value: unknown) => {
      sharedValues[key] = value;

      return null;
    },
    shared: (key: string) => sharedValues[key],
    spaces: () => spaceList,
    theme: () => themeColors,
  }),
);

const { writeSection } = await import('../../kit/section.ts');

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
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

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
  // A view that starts marked shows its cursor row in its first draw, which no test here counts.
  scrollCalls = [];

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

const spaceNames = (view: FakeView): string[] =>
  drawnTexts(view.render()).filter((text) => text.startsWith('name-'));

// The place of the outlined row among the direct children of the scrolling list.
const cursorChildIndex = (view: FakeView): number => {
  const list = elementsWithSizeHandler(view.render())[0];

  return (list?.kids ?? []).findIndex(
    (child) => elementsWithBorder(child, themeColors.accent).length > 0,
  );
};

const reportHeight = (view: FakeView, height: number): void => {
  for (const element of elementsWithSizeHandler(view.render())) {
    element.sizeHandlers[0]?.({ width: 200, height }, {});
  }
};

beforeEach(() => {
  runCalls = [];
  notifyCalls = 0;
  scrollCalls = [];
  sharedValues = {};
  sidebarWidth = null;
  commandQueue.length = 0;
  commandWaiters.length = 0;
  store.clear();
  spaceList = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => space(id, id === 'b'));
  gitByFolder = {};
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

  test('a click on a project header folds it to its active space and publishes the rest as hidden', async () => {
    const view = await loadView();

    const header = clickablesWithText(view.render(), 'notes')[0];

    header?.clickHandlers[0]?.({}, { notify: () => undefined });

    expect(spaceNames(view)).toEqual(['name-b']);
    expect(drawnTexts(view.render())).toContain('7 more');

    expect(sharedValues['spaces.order']).toEqual({
      shown: ['b'],
      hidden: ['a', 'c', 'd', 'e', 'f', 'g', 'h'],
      roots: ['b'],
    });
  });

  test('draws and publishes the spaces project by project', async () => {
    spaceList = [space('a', true), space('w', false, '/code/work'), space('c', false)];

    const view = await loadView();

    expect(spaceNames(view)).toEqual(['name-a', 'name-c', 'name-w']);

    expect(sharedValues['spaces.order']).toEqual({
      shown: ['a', 'c', 'w'],
      hidden: [],
      roots: ['a', 'w'],
    });
  });

  test('a list command asks the list to show the cursor row on the next draw, once', async () => {
    const view = await loadView();

    await send('list-last');
    view.render();
    view.render();

    expect(cursorNames(view)).toEqual(['name-h']);
    expect(scrollCalls).toEqual([cursorChildIndex(view)]);
  });

  test('the row to show counts the project headers above it', async () => {
    spaceList = [space('a', true), space('w', false, '/code/work')];

    const view = await loadView();

    await send('list-last');
    view.render();

    const plain = cursorChildIndex(view);

    expect(cursorNames(view)).toEqual(['name-w']);
    expect(plain).toBeGreaterThanOrEqual(3);
    expect(scrollCalls).toEqual([plain]);
  });

  test('the draw in which the sidebar became marked asks to show the cursor row, once', async () => {
    mark('panes');

    const view = await loadView();

    mark('sidebar');
    view.render();

    const shown = [...scrollCalls];

    view.render();

    expect(shown).toEqual([cursorChildIndex(view)]);
    expect(scrollCalls).toEqual(shown);
  });

  test('a draw in which the sidebar lost its mark asks for no scroll', async () => {
    const view = await loadView();

    mark('panes');
    view.render();

    expect(scrollCalls).toEqual([]);
  });

  test('a draw with no list command asks for no scroll', async () => {
    const view = await loadView();

    view.render();
    spaceList = spaceList.map((candidate) => space(candidate.id, candidate.id === 'h'));
    view.render();

    expect(scrollCalls).toEqual([]);
  });

  test('a list command on a sidebar that is not marked asks for no scroll', async () => {
    mark('panes');

    const view = await loadView();

    await send('list-last');
    view.render();

    expect(scrollCalls).toEqual([]);
  });

  test('a narrow sidebar draws full space names', async () => {
    sidebarWidth = 100;

    const view = await loadView();

    expect(spaceNames(view)).toEqual(spaceList.map((candidate) => candidate.name));
  });
});

const pressable = (element: DrawnElement): boolean =>
  element.mouseHandlers['on_mouse_down:left'] !== undefined;

describe('koja-spaces main space header', () => {
  const useRepository = (): void => {
    gitByFolder = {
      '/code/koja': checkoutOf('/code/koja', false),
      '/code/koja-fix': checkoutOf('/code/koja-fix', true),
    };

    spaceList = [space('w', true, '/code/koja-fix'), space('m', false, '/code/koja')];
  };

  const headerOf = (view: FakeView): DrawnElement | undefined =>
    elementsWithMouseHandlers(view.render())
      .filter(pressable)
      .find((element) => drawnTexts(element).includes('koja'));

  test('draws the main space as the header, not as a row', async () => {
    useRepository();

    const view = await loadView();

    expect(spaceNames(view)).toEqual(['name-w']);
    expect(drawnTexts(view.render()).filter((text) => text === 'koja')).toHaveLength(1);
  });

  test('a click on the header selects the main space', async () => {
    useRepository();

    const view = await loadView();

    press(headerOf(view) as DrawnElement, {
      notify: () => undefined,
      stop_propagation: () => undefined,
    });

    expect(selected()).toEqual(['m']);
  });

  test('the cursor stops on the header and list-open selects the main space', async () => {
    useRepository();

    const view = await loadView();

    await send('list-first');

    expect(cursorNames(view)).toEqual(['koja']);

    await send('list-open');

    expect(selected()).toEqual(['m']);
  });

  test('publishes the main space once, at the header, and as the root', async () => {
    useRepository();

    await loadView();

    expect(sharedValues['spaces.order']).toEqual({ shown: ['m', 'w'], hidden: [], roots: ['m'] });
  });
});

const projectCheckout = (project: string, folder: string, linked: boolean): GitInfo => ({
  branch: 'main',
  repo: repositoryOf(null, `/code/${project}/.git`),
  root: folder,
  cwd: folder,
  linked,
});

const handlersOf = (element: DrawnElement, name: string): MouseHandler[] =>
  element.mouseHandlers[name] ?? [];

describe('koja-spaces drag and drop', () => {
  const useSpaces = (ids: string[]): void => {
    gitByFolder = {};

    for (const id of ids) {
      const [project = id, worktree] = id.split('-');
      const folder = `/code/${id}`;

      gitByFolder[folder] = projectCheckout(project, folder, worktree !== undefined);
    }

    spaceList = ids.map((id) => space(id, false, `/code/${id}`));
  };

  const context = { notify: () => undefined, stop_propagation: () => undefined };

  const rowOf = (view: FakeView, id: string): DrawnElement => {
    const label = id.includes('-') ? `name-${id}` : id;

    const found = elementsWithMouseHandlers(view.render())
      .filter(pressable)
      .find((element) => drawnTexts(element).includes(label));

    if (found === undefined) {
      throw new Error(`No row for ${id}`);
    }

    return found;
  };

  const moveOver = (element: DrawnElement): void => {
    const handler = element.styles['on_mouse_move']?.[0] as MouseHandler | undefined;

    handler?.({}, context);
  };

  const dragOver = (view: FakeView, source: string, target: string): void => {
    for (const handler of handlersOf(rowOf(view, source), 'on_mouse_down:left')) {
      handler({}, context);
    }

    moveOver(rowOf(view, target));
  };

  const dragAndDrop = (view: FakeView, source: string, target: string): void => {
    dragOver(view, source, target);

    for (const handler of handlersOf(rowOf(view, target), 'on_mouse_up:left')) {
      handler({}, context);
    }
  };

  const moves = (): unknown[] =>
    runCalls.filter((call) => call.command === 'space.move').map((call) => call.args);

  // Applies the moves as Herdr does: each index is the one-based final place in the whole order.
  const orderAfterMoves = (): string[] => {
    const order = spaceList.map((candidate) => candidate.id);

    for (const move of moves() as { id: string; index: number }[]) {
      const rest = order.filter((id) => id !== move.id);

      rest.splice(move.index - 1, 0, move.id);
      order.splice(0, order.length, ...rest);
    }

    return order;
  };

  const showsDropLine = (element: DrawnElement): boolean =>
    element.kids.some((kid) => kid.backgroundColors.includes(themeColors.accent));

  test('a drop of the first space on the last space of its project moves it there', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2', 'alpha-3', 'beta', 'beta-1']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-1', 'alpha-3');

    expect(orderAfterMoves()).toEqual(['alpha', 'alpha-2', 'alpha-3', 'alpha-1', 'beta', 'beta-1']);
  });

  test('a drop inside a project whose spaces sit among another project keeps the project order', async () => {
    useSpaces(['alpha-1', 'beta-1', 'alpha-2', 'alpha-3']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-1', 'alpha-3');

    expect(orderAfterMoves()).toEqual(['alpha-2', 'beta-1', 'alpha-3', 'alpha-1']);
  });

  test('a drop on a row in another project moves no space', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2', 'beta', 'beta-1']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-2', 'beta-1');

    expect(moves()).toEqual([]);
  });

  test('a drop on the main space header moves no space', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-2', 'alpha');

    expect(moves()).toEqual([]);
  });

  test('a drop of the main space header on a row of its project moves no space', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragAndDrop(view, 'alpha', 'alpha-2');

    expect(moves()).toEqual([]);
  });

  test('a press and release on a row selects its space', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-1', 'alpha-1');

    expect(selected()).toEqual(['alpha-1']);
    expect(moves()).toEqual([]);
  });

  test('a drag over a row in another project shows no drop line and a not-allowed cursor', async () => {
    useSpaces(['alpha', 'alpha-1', 'beta', 'beta-1']);

    const view = await loadView();

    dragOver(view, 'alpha-1', 'beta-1');

    const target = rowOf(view, 'beta-1');

    expect(showsDropLine(target)).toBe(false);
    expect(target.styles['cursor_not_allowed']).toBeDefined();
  });

  test('a drag over the main space header shows no drop line and a not-allowed cursor', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragOver(view, 'alpha-2', 'alpha');

    const target = rowOf(view, 'alpha');

    expect(showsDropLine(target)).toBe(false);
    expect(target.styles['cursor_not_allowed']).toBeDefined();
  });

  test('a drag over a row in its own project shows a drop line and no not-allowed cursor', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragOver(view, 'alpha-1', 'alpha-2');

    const target = rowOf(view, 'alpha-2');

    expect(showsDropLine(target)).toBe(true);
    expect(target.styles['cursor_not_allowed']).toBeUndefined();
  });
});
