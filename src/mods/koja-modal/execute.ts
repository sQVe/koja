import { recordOf, stringOf } from '../../kit/fields.ts';
import type { NormalAction, NormalIntent } from '../../kit/normalKeys.ts';

export interface PaneLike {
  pane: string;
  tab: string;
}

interface FocusedPane {
  pane: string | null;
  tab: string | null;
  space: string | null;
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
  store: ExecutorStore;
  historyKey: string;
}

type RunnableAction = Exclude<NormalAction, { kind: 'leave' | 'list' | 'section' }>;

export interface Executor {
  execute: (action: RunnableAction) => void;
  observe: () => void;
}

interface NormalModeHistory {
  current: FocusedPane | null;
  lastPane: string | null;
  lastTab: string | null;
}

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

const selectTab = (index: number, deps: ExecutorDeps): void => {
  deps.run('tab.select', { index });
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

const runIntent = (intent: NormalIntent, previous: NormalModeHistory, deps: ExecutorDeps): void => {
  switch (intent) {
    case 'closeOtherPanes': {
      closeOtherPanes(deps);

      break;
    }

    case 'nextPane': {
      movePane(1, deps);

      break;
    }

    case 'previousPane': {
      movePane(-1, deps);

      break;
    }

    case 'lastPane': {
      focusLastPane(previous, deps);

      break;
    }

    case 'lastTab': {
      focusLastTab(previous, deps);

      break;
    }
  }
};

export const createExecutor = (deps: ExecutorDeps): Executor => {
  const execute = (action: RunnableAction): void => {
    const history = observeFocus(deps);

    switch (action.kind) {
      case 'command': {
        deps.run(action.command, action.args);

        break;
      }

      case 'nthTab': {
        selectTab(action.index, deps);

        break;
      }

      case 'intent': {
        runIntent(action.intent, history, deps);

        break;
      }
    }
  };

  return {
    execute,
    observe: () => {
      observeFocus(deps);
    },
  };
};
