import { recordOf, stringOf } from '../../kit/fields.ts';
import type { NormalAction, NormalIntent } from '../../kit/normalKeys.ts';
import type { SpaceOrder } from '../../kit/spaceOrder.ts';
import { readSpaceOrder } from '../../kit/spaceOrder.ts';

export interface PaneLike {
  pane: string;
  tab: string;
}

interface FocusedPane {
  pane: string | null;
  tab: string | null;
  space: string | null;
}

interface LiveSpace {
  id: string;
}

interface ExecutorStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

type RunCommand = (command: string, args?: Record<string, unknown>) => void;

export interface ExecutorDeps {
  run: RunCommand;
  panes: () => PaneLike[];
  focused: () => FocusedPane | null;
  spaces: () => LiveSpace[];
  store: ExecutorStore;
  historyKey: string;
}

type RunnableAction = Exclude<NormalAction, { kind: 'leave' }>;

export interface Executor {
  execute: (action: RunnableAction, count: number | null) => void;
  observe: () => void;
}

interface NormalModeHistory {
  current: FocusedPane | null;
  lastPane: string | null;
  lastTab: string | null;
}

type IntentRunner = (count: number | null, previous: NormalModeHistory, deps: ExecutorDeps) => void;

const readFocused = (value: unknown): FocusedPane | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = recordOf(value);

  return {
    pane: stringOf(record['pane']),
    tab: stringOf(record['tab']),
    space: stringOf(record['space']),
  };
};

const readHistory = (value: unknown): NormalModeHistory => {
  const record = recordOf(value);

  return {
    current: readFocused(record['current']),
    lastPane: stringOf(record['lastPane']),
    lastTab: stringOf(record['lastTab']),
  };
};

const observeFocus = (deps: ExecutorDeps): NormalModeHistory => {
  const focused = deps.focused();
  const previous = readHistory(deps.store.get(deps.historyKey));

  if (focused === null) {
    return previous;
  }

  const unchanged = previous.current?.pane === focused.pane && previous.current.tab === focused.tab;

  if (unchanged) {
    return previous;
  }

  const next: NormalModeHistory = {
    ...previous,
    current: { pane: focused.pane, tab: focused.tab, space: focused.space },
  };

  if (previous.current !== null) {
    if (previous.current.tab !== focused.tab) {
      next.lastTab = previous.current.tab;
    } else if (previous.current.pane !== focused.pane) {
      next.lastPane = previous.current.pane;
    }
  }

  deps.store.set(deps.historyKey, next);

  return next;
};

const closeOtherPanes = (deps: ExecutorDeps): void => {
  const current = deps.focused();

  if (current === null) {
    return;
  }

  if (current.pane === null) {
    return;
  }

  const others = deps
    .panes()
    .filter((pane) => pane.tab === current.tab && pane.pane !== current.pane);

  for (const other of others) {
    deps.run('pane.close', { pane: other.pane });
  }
};

const movePane = (step: number, deps: ExecutorDeps): void => {
  const current = deps.focused();

  if (current === null) {
    return;
  }

  if (current.pane === null || current.tab === null) {
    return;
  }

  const inTab = deps.panes().filter((pane) => pane.tab === current.tab);
  const index = inTab.findIndex((pane) => pane.pane === current.pane);

  if (index === -1) {
    return;
  }

  const target = inTab[(index + step + inTab.length) % inTab.length];

  if (target === undefined) {
    return;
  }

  if (target.pane === current.pane) {
    return;
  }

  deps.run('pane.focus', { pane: target.pane });
};

const focusLastPane = (previous: NormalModeHistory, deps: ExecutorDeps): void => {
  const target = previous.lastPane;
  const current = deps.focused();

  if (target === null) {
    return;
  }

  if (current === null) {
    return;
  }

  if (current.tab === null) {
    return;
  }

  if (target === current.pane) {
    return;
  }

  const exists = deps.panes().some((pane) => pane.tab === current.tab && pane.pane === target);

  if (!exists) {
    return;
  }

  deps.run('pane.focus', { pane: target });
};

const selectTab = (count: number | null, deps: ExecutorDeps): void => {
  if (count === null) {
    return;
  }

  deps.run('tab.select', { index: count });
};

const focusLastTab = (previous: NormalModeHistory, deps: ExecutorDeps): void => {
  const target = previous.lastTab;
  const current = deps.focused();

  if (target === null) {
    return;
  }

  if (current === null) {
    return;
  }

  if (current.tab === target) {
    return;
  }

  const exists = deps.panes().some((pane) => pane.tab === target);

  if (!exists) {
    return;
  }

  deps.run('tab.select', { id: target });
};

const spaceIndex = (order: string[] | null, current: string | null): number => {
  if (order === null || current === null) {
    return -1;
  }

  return order.indexOf(current);
};

const hasUnlistedSpace = (order: SpaceOrder, liveIds: string[]): boolean =>
  liveIds.some((id) => !order.shown.includes(id) && !order.hidden.includes(id));

const liveSpaceOrder = (deps: ExecutorDeps): SpaceOrder | null => {
  const order = readSpaceOrder(deps.store.get);

  if (order === null) {
    return null;
  }

  const liveIds = deps.spaces().map((space) => space.id);

  if (hasUnlistedSpace(order, liveIds)) {
    return null;
  }

  const live = new Set(liveIds);

  return { shown: order.shown.filter((id) => live.has(id)), hidden: order.hidden };
};

const targetSpace = (order: SpaceOrder, current: string | null, step: number): string | null => {
  const shown = order.shown;
  const index = spaceIndex(shown, current);

  if (index !== -1) {
    return shown[(index + step + shown.length) % shown.length] ?? null;
  }

  const currentHidden = current !== null && order.hidden.includes(current);

  if (!currentHidden) {
    return null;
  }

  return (step > 0 ? shown[0] : shown.at(-1)) ?? null;
};

const stepSpace = (step: number, fallback: string, deps: ExecutorDeps): void => {
  const order = liveSpaceOrder(deps);
  const current = deps.focused()?.space ?? null;
  const target = order === null ? null : targetSpace(order, current, step);

  if (target === null) {
    deps.run(fallback);

    return;
  }

  if (target === current) {
    return;
  }

  deps.run('space.select', { id: target });
};

const intentRunners: Record<NormalIntent, IntentRunner> = {
  closeOtherPanes: (_count, _previous, deps) => {
    closeOtherPanes(deps);
  },
  nextPane: (_count, _previous, deps) => {
    movePane(1, deps);
  },
  previousPane: (_count, _previous, deps) => {
    movePane(-1, deps);
  },
  lastPane: (_count, previous, deps) => {
    focusLastPane(previous, deps);
  },
  nthTab: (count, _previous, deps) => {
    selectTab(count, deps);
  },
  lastTab: (_count, previous, deps) => {
    focusLastTab(previous, deps);
  },
  nextSpace: (_count, _previous, deps) => {
    stepSpace(1, 'space.next', deps);
  },
  previousSpace: (_count, _previous, deps) => {
    stepSpace(-1, 'space.prev', deps);
  },
};

const runAction = (
  action: RunnableAction,
  count: number | null,
  history: NormalModeHistory,
  deps: ExecutorDeps,
): void => {
  if (action.kind === 'command') {
    deps.run(action.command);

    return;
  }

  intentRunners[action.intent](count, history, deps);
};

export const createExecutor = (deps: ExecutorDeps): Executor => {
  const execute = (action: RunnableAction, count: number | null): void => {
    runAction(action, count, observeFocus(deps), deps);
  };

  return {
    execute,
    observe: () => {
      observeFocus(deps);
    },
  };
};
