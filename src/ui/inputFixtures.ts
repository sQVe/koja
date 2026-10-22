import type { InputMode, TabRoute, WorkspaceCommand } from '../client/client.ts';
import { paneId, workspaceId } from '../ids.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import { ModeFlag } from '../rows/rows.ts';
import { createInputRouter } from './input.ts';
import type { ScrollAction } from './input.ts';
import type { PaneAction } from './paneActions.ts';

type RouterHost = Parameters<typeof createInputRouter>[0];

interface WorkspaceSnapshot {
  ids: WorkspaceId[];
  focused: WorkspaceId | undefined;
}

interface GonePanes {
  unplaced: Set<PaneId>;
  missing: Set<PaneId>;
  sizes: Map<PaneId, { columns: number; rows: number }>;
}

interface InputHarness {
  input: ReturnType<typeof createInputRouter>;
  press: (raw: string) => void;
  mouse: (code: number, column: number, row: number, final: 'M' | 'm') => void;
  pastes: (text: string) => void;
  sent: string[];
  toPane: { pane: PaneId; text: string }[];
  scrolls: ScrollAction[];
  tabs: TabRoute[];
  actions: PaneAction[];
  commands: WorkspaceCommand[];
  replies: (() => void)[];
  failures: (() => void)[];
  focused: PaneId[];
  focusGate: { current: Promise<undefined> };
  snapshot: WorkspaceSnapshot;
  gone: GonePanes;
  modeChanges: InputMode[];
  mode: () => InputMode;
  detaches: () => number;
  setModes: (next: number) => void;
  startTab: () => void;
  answerTab: () => void;
  answerPaneAction: () => Promise<void>;
}

export const firstWorkspace = workspaceId(1);
export const secondWorkspace = workspaceId(2);

export const decoder = new TextDecoder();
export const encoder = new TextEncoder();

export const nextTick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const paneColumns = 10;
const lastPaneColumn = paneColumns - 1;
const screenColumns = paneColumns * 2;
const workspaceRowStart = 50;
const tabLabelStart = 60;
const tabLabelEnd = 70;
const chromeWorkspaceNumber = 7;
const chromeWorkspace = workspaceId(chromeWorkspaceNumber);

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

const chromeAtColumn = (x: number): ReturnType<RouterHost['chromeAt']> => {
  if (x >= tabLabelStart && x < tabLabelEnd) {
    return { kind: 'tab', number: 2 };
  }

  const inWorkspaceRow = x >= workspaceRowStart && x < tabLabelStart;

  return inWorkspaceRow ? { kind: 'workspace', workspaceId: chromeWorkspace } : undefined;
};

// Pane 1 holds columns 0 to 9 and pane 2 holds columns 10 to 19. A workspace row sits at columns 50
// to 59 and a tab label at columns 60 to 69. Each host part can be overridden.
export const createInputHarness = (
  initial: InputMode = 'insert',
  overrides: Partial<RouterHost> = {},
  initialModes = 0,
): InputHarness => {
  let mode = initial;
  let modes = initialModes;
  let tabIsPending = false;
  let detaches = 0;
  const modeChanges: InputMode[] = [];
  const sent: string[] = [];
  const toPane: { pane: PaneId; text: string }[] = [];
  const scrolls: ScrollAction[] = [];
  const tabs: TabRoute[] = [];
  const actions: PaneAction[] = [];
  const paneAnswers: (() => void)[] = [];
  const commands: WorkspaceCommand[] = [];
  const replies: (() => void)[] = [];
  const failures: (() => void)[] = [];
  const tabCallbacks: (() => void)[] = [];
  const focused: PaneId[] = [];
  const focusGate: { current: Promise<undefined> } = { current: Promise.resolve(undefined) };

  const snapshot: WorkspaceSnapshot = {
    ids: [firstWorkspace, secondWorkspace],
    focused: firstWorkspace,
  };

  const gone: GonePanes = { unplaced: new Set(), missing: new Set(), sizes: new Map() };

  const input = createInputRouter({
    mode: () => mode,
    setMode: (next) => {
      mode = next;
      modeChanges.push(next);
    },
    modes: () => modes,
    send: (bytes) => {
      if (bytes.length > 0) {
        sent.push(decoder.decode(bytes));
      }
    },
    mouseTarget: (x, y, pane) => {
      if (pane !== undefined) {
        if (gone.unplaced.has(pane)) {
          return undefined;
        }

        return {
          paneId: pane,
          column: clamp(x - (pane === paneId(2) ? paneColumns : 0), 0, lastPaneColumn),
          row: y,
        };
      }

      if (x < 0 || x >= screenColumns) {
        return undefined;
      }

      return { paneId: paneId(x < paneColumns ? 1 : 2), column: x % paneColumns, row: y };
    },
    focusedPane: () => paneId(1),
    chromeAt: chromeAtColumn,
    focusPane: (pane) => {
      focused.push(pane);

      return focusGate.current;
    },
    paneModes: (pane) => (gone.missing.has(pane) ? 0 : ModeFlag.buttonMouse | ModeFlag.sgrMouse),
    paneSize: (pane) =>
      gone.missing.has(pane) ? undefined : (gone.sizes.get(pane) ?? { columns: 10, rows: 100 }),
    sendToPane: (pane, bytes) => {
      toPane.push({ pane, text: decoder.decode(bytes) });
    },
    detach: () => {
      detaches += 1;
    },
    workspaces: () => ({ ids: snapshot.ids, focused: snapshot.focused }),
    startDirectory: '/work/start',
    command: (command, onReply) => {
      commands.push(command);

      replies.push(() => {
        onReply('done');
      });

      failures.push(() => {
        onReply('failed');
      });
    },
    tab: (route) => {
      tabs.push(route);
    },
    tabPending: () => tabIsPending,
    afterTabAnswer: (callback) => {
      tabCallbacks.push(callback);
    },
    paneAction: (action) => {
      actions.push(action);

      return new Promise((resolve) => {
        paneAnswers.push(resolve);
      });
    },
    scroll: (action) => {
      scrolls.push(action);
    },
    ...overrides,
  });

  const press = (raw: string) => {
    input({ kind: 'key', raw, escapeSent: false });
  };

  const mouse = (code: number, column: number, row: number, final: 'M' | 'm') => {
    input({ kind: 'mouse', raw: `\x1b[<${code};${column};${row}${final}`, escapeSent: false });
  };

  const pastes = (text: string) => {
    input({ kind: 'paste', bytes: encoder.encode(text), escapeSent: false });
  };

  const answerTab = () => {
    tabIsPending = false;

    for (const callback of tabCallbacks.splice(0)) {
      callback();
    }
  };

  return {
    input,
    press,
    mouse,
    pastes,
    sent,
    toPane,
    scrolls,
    tabs,
    actions,
    commands,
    replies,
    failures,
    focused,
    focusGate,
    snapshot,
    gone,
    modeChanges,
    mode: () => mode,
    detaches: () => detaches,
    setModes: (next: number): void => {
      modes = next;
    },
    startTab: (): void => {
      tabIsPending = true;
    },
    answerTab,
    answerPaneAction: async () => {
      paneAnswers.shift()?.();
      await Promise.resolve();
    },
  };
};
