import { mock } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { placeOf, repositoryOf, worktreeOf } from '../src/data/gitIdentity.ts';
import { heartbeatKey, leaseKey } from '../src/data/lease.ts';
import type { Facts, PlaceGit, RepositoryPulls, WorktreeGit } from '../src/data/snapshot.ts';
import { emptyFacts, snapshotKey, snapshotVersion } from '../src/data/snapshot.ts';
import { writeSection } from '../src/kit/section.ts';
import { rowHeight } from '../src/kit/size.ts';
import {
  drawn,
  drawnTexts,
  elementsWithBorder,
  elementsWithId,
  elementsWithSizeHandler,
} from './drawn.ts';
import type { DrawnElement } from './drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake, realKitIndexFake } from './moduleFakes.ts';

export type MouseHandler = (event: unknown, cx: unknown) => void;

interface RunCall {
  command: string;
  args: Record<string, unknown> | undefined;
}

interface ExecCall {
  command: string;
  args: string[];
  cwd: string;
  on: string | null;
}

interface Timer {
  milliseconds: number;
  handler: (cx: unknown) => void;
}

export interface FakeView {
  init: (props: unknown, cx: unknown) => void;
  render: () => DrawnElement;
  close: () => void;
}

export interface Checkout {
  folder: string;
  machine?: string | null;
  commonDirectory: string;
  linked: boolean;
  branch?: string;
}

export const themeColors = {
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

export const rowHeightSmall = rowHeight.small;

const realRandomUuid = crypto.randomUUID;

const timerHarnessContext = {
  notify: () => {
    state.notifyCalls += 1;
  },
  spawn: (body: (cx: unknown) => Promise<void>) => {
    body(timerHarnessContext).catch(() => undefined);
  },
};

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

class HostView {
  render(): unknown {
    return null;
  }
}

export const state = {
  runCalls: [] as RunCall[],
  execCalls: [] as ExecCall[],
  checkingNow: false,
  overlayCalls: [] as unknown[],
  notifyCalls: 0,
  scrollCalls: [] as number[],
  sharedValues: {} as Record<string, unknown>,
  sharedWrites: [] as string[],
  sidebarWidth: null as number | null,
  spaceList: [] as SpaceInfo[],
  timers: [] as Timer[],
  store: new Map<string, string>(),
};

export const space = (
  id: string,
  active: boolean,
  folder = '/code/notes',
  machine: string | null = null,
): SpaceInfo => ({
  id,
  index: 1,
  name: `name-${id}`,
  named: true,
  folder,
  machine,
  branch: null,
  active,
  status: null,
  tabs: [],
});

export const storedFacts = (
  checkouts: readonly Checkout[],
  pulls: Record<string, RepositoryPulls> = {},
): Facts => {
  const places: Record<string, PlaceGit> = {};
  const worktrees: Record<string, WorktreeGit> = {};

  for (const checkout of checkouts) {
    const machine = checkout.machine ?? null;
    const worktree = worktreeOf(machine, checkout.folder);

    places[placeOf(machine, checkout.folder).key] = {
      kind: 'repository',
      worktree: worktree.key,
    };

    worktrees[worktree.key] = {
      repository: repositoryOf(machine, checkout.commonDirectory),
      root: checkout.folder,
      branch: checkout.branch ?? 'main',
      linked: checkout.linked,
      bare: false,
    };
  }

  return { ...emptyFacts(), git: { places, worktrees }, pulls };
};

export const showFacts = (facts: Facts): void => {
  state.sharedValues[snapshotKey] = { version: snapshotVersion, revision: 1, facts };
};

export const anotherOwner = (): void => {
  const lease = { version: 1, owner: 'window-b', generation: 1 };

  state.sharedValues[leaseKey] = lease;
  state.sharedValues[heartbeatKey] = { ...lease, at: Date.now() };
};

const installedGlobals = ['kojaModName', 'localStorage'] as const;
const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

const restoreGlobal = (name: string, descriptor: PropertyDescriptor | undefined): void => {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name);

    return;
  }

  Object.defineProperty(globalThis, name, descriptor);
};

const installGlobals = (): void => {
  for (const name of installedGlobals) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }

  Object.assign(globalThis, {
    kojaModName: 'koja',
    localStorage: {
      getItem: (key: string) => state.store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        state.store.set(key, value);
      },
    },
  });
};

const mockHostModules = async (): Promise<void> => {
  await mock.module('gpui-base', () =>
    gpuiBaseFake({
      h_flex: () => drawn(),
      v_flex: () => drawn(),
      ScrollHandle: {
        new: () => ({
          scroll_to_item: (index: number) => {
            state.scrollCalls.push(index);
          },
        }),
      },
    }),
  );

  await mock.module('gpui-kit', () =>
    gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path), View: HostView }),
  );

  await mock.module('herdr', () =>
    herdrFake({
      checking: () => state.checkingNow,
      exec: async (
        command: string,
        args: string[],
        options: { cwd: string; on: string | null },
      ) => {
        state.execCalls.push({ command, args, cwd: options.cwd, on: options.on });

        return { code: 128, stdout: '', stderr: 'fatal: not a git repository' };
      },
      layout: () => ({ id: 'sidebar', size: { px: state.sidebarWidth } }),
      nextCommand,
      openOverlay: (options: unknown) => {
        state.overlayCalls.push(options);

        return null;
      },
      run: (command: string, args?: Record<string, unknown>) => {
        state.runCalls.push({ command, args });

        return null;
      },
      setShared: (key: string, value: unknown) => {
        state.sharedWrites.push(key);
        state.sharedValues[key] = value;

        return null;
      },
      shared: (key: string) => state.sharedValues[key],
      spaces: () => state.spaceList,
      theme: () => themeColors,
    }),
  );
};

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

const mockKit = async (): Promise<void> => {
  const kitFake = await realKitIndexFake(kitParts);

  await mock.module('../src/kit/index.ts', () => kitFake);
};

export const setupKojaSpaces = async (): Promise<void> => {
  if (savedGlobals.size > 0) {
    return;
  }

  installGlobals();
  await mockHostModules();
  await mockKit();
};

export const restoreKojaSpaces = (): void => {
  for (const [name, descriptor] of savedGlobals) {
    restoreGlobal(name, descriptor);
  }

  savedGlobals.clear();
  crypto.randomUUID = realRandomUuid;
  mock.restore();
};

export const mark = (section: 'sidebar' | 'panes'): void => {
  writeSection((key, value) => {
    state.sharedValues[key] = value;
  }, section);
};

export const resetKojaSpaces = (): void => {
  state.runCalls = [];
  state.execCalls = [];
  state.checkingNow = false;
  state.overlayCalls = [];
  state.notifyCalls = 0;
  state.scrollCalls = [];
  state.sharedValues = {};
  state.sharedWrites = [];
  state.sidebarWidth = null;
  commandQueue.length = 0;
  commandWaiters.length = 0;
  state.store.clear();
  state.spaceList = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => space(id, id === 'b'));
  state.timers = [];
  crypto.randomUUID = realRandomUuid;
  mark('sidebar');
};

export const loadView = async (): Promise<FakeView> => {
  const modulePath = '../src/mods/koja-spaces/main.ts';

  const loaded = (await import(modulePath)) as {
    default: new () => FakeView;
  };

  const view = new loaded.default();

  const context = {
    notify: () => {
      state.notifyCalls += 1;
    },
    spawn: (body: (cx: unknown) => Promise<void>) => {
      body(context).catch(() => undefined);
    },
    timer: {
      every: (milliseconds: number, handler: (cx: unknown) => void) => {
        state.timers.push({ milliseconds, handler });
      },
    },
  };

  view.init({}, context);
  view.render();
  // A view that starts marked shows its cursor row in its first draw, which no test here counts.
  state.scrollCalls = [];

  return view;
};

export const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

export const runTimers = (milliseconds: number): void => {
  for (const timer of state.timers) {
    if (timer.milliseconds === milliseconds) {
      timer.handler(timerHarnessContext);
    }
  }
};

export const runTimersUntil = (milliseconds: number): void => {
  for (const timer of state.timers) {
    if (timer.milliseconds <= 0) {
      continue;
    }

    for (let at = timer.milliseconds; at <= milliseconds; at += timer.milliseconds) {
      timer.handler(timerHarnessContext);
    }
  }
};

export const send = async (command: string): Promise<void> => {
  deliverCommand(command);

  await flush();
};

export const redrawsOf = async (command: string): Promise<number> => {
  await flush();

  const before = state.notifyCalls;

  await send(command);

  return state.notifyCalls - before;
};

export const selected = (): unknown[] =>
  state.runCalls.filter((call) => call.command === 'space.select').map((call) => call.args?.['id']);

export const cursorNames = (view: FakeView): string[] =>
  elementsWithBorder(view.render(), themeColors.accent).flatMap(drawnTexts);

export const spaceNames = (view: FakeView): string[] =>
  drawnTexts(view.render()).filter((text) => text.startsWith('name-'));

// The place of the outlined row among the direct children of the scrolling list.
export const cursorChildIndex = (view: FakeView): number => {
  const list = elementsWithSizeHandler(view.render())[0];

  return (list?.kids ?? []).findIndex(
    (child) => elementsWithBorder(child, themeColors.accent).length > 0,
  );
};

export const spaceChildIndex = (view: FakeView, id: string): number => {
  const list = elementsWithSizeHandler(view.render())[0];

  return (list?.kids ?? []).findIndex((child) => elementsWithId(child, `space-${id}`).length > 0);
};

export const reportSize = (view: FakeView, width: number, height: number): void => {
  for (const element of elementsWithSizeHandler(view.render())) {
    element.sizeHandlers[0]?.({ width, height }, {});
  }
};

export const reportHeight = (view: FakeView, height: number): void => {
  reportSize(view, 200, height);
};

export const pressable = (element: DrawnElement): boolean =>
  element.mouseHandlers['on_mouse_down:left'] !== undefined;
