import { actionCatalog } from '../actions.ts';
import type { PaneAction } from '../actions.ts';
import type {
  ClipboardReadResult,
  InputMode,
  PanePasteResult,
  PasteRequest,
  StoreSnapshot,
  TabRoute,
  WorkspaceCommand,
} from '../client/client.ts';
import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { legacyArrangement } from '../layout.ts';
import { ModeFlag } from '../rows/rows.ts';
import { actionViewRowsOf, createActionView } from './actionView.ts';
import type { ActionView } from './actionView.ts';
import { createInputRouter } from './input.ts';
import type { ScrollAction } from './input.ts';
import { createPanePaste } from './panePaste.ts';
import type { PanePaste } from './panePaste.ts';

type RouterHost = Parameters<typeof createInputRouter>[0];

interface WorkspaceSnapshot {
  ids: WorkspaceId[];
  focused: WorkspaceId | undefined;
}

interface GonePanes {
  unplaced: Set<PaneId>;
  missing: Set<PaneId>;
  sizes: Map<PaneId, { columns: number; rows: number }>;
  replacedBy: Map<PaneId, PaneId>;
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
  view: ActionView;
  modeChanges: InputMode[];
  mode: () => InputMode;
  detaches: () => number;
  setModes: (next: number) => void;
  startTab: () => void;
  answerTab: () => void;
  answerPaneAction: () => Promise<void>;
  changeStore: (next: StoreSnapshot) => void;
  store: () => StoreSnapshot;
  replacePane: (pane: PaneId, replacement: PaneId | undefined) => void;
  clipboardReads: ClipboardReadFake[];
  pasteRequests: PasteRequest[];
  answerPaste: (result: PanePasteResult) => Promise<void>;
  pasteFlow: PanePaste;
}

interface ClipboardReadFake {
  signal: AbortSignal;
  settle: (result: ClipboardReadResult) => Promise<void>;
}

interface TabFixture {
  id: number;
  workspaceId: WorkspaceId;
  panes: readonly PaneId[];
  focused: PaneId;
}

type TabLayout = StoreSnapshot['tabs'][number]['layout'];

export const firstWorkspace = workspaceId(1);
export const secondWorkspace = workspaceId(2);

const rowLayout = (panes: readonly PaneId[]): TabLayout => {
  const [first, ...rest] = panes;

  invariant(first !== undefined, 'a tab holds a pane');

  if (rest.length === 0) {
    return { kind: 'pane', paneId: first };
  }

  return {
    kind: 'split',
    direction: 'right',
    ratio: 0.5,
    first: { kind: 'pane', paneId: first },
    second: rowLayout(rest),
  };
};

const thirdPaneNumber = 3;
const fourthPaneNumber = 4;
const fifthPaneNumber = 5;

const harnessTabs: readonly TabFixture[] = [
  {
    id: 1,
    workspaceId: firstWorkspace,
    panes: [paneId(2), paneId(1), paneId(thirdPaneNumber)],
    focused: paneId(1),
  },
  {
    id: 2,
    workspaceId: firstWorkspace,
    panes: [paneId(fourthPaneNumber)],
    focused: paneId(fourthPaneNumber),
  },
  {
    id: 3,
    workspaceId: secondWorkspace,
    panes: [paneId(fifthPaneNumber)],
    focused: paneId(fifthPaneNumber),
  },
];

const size = { columns: 80, rows: 24 };

export const storeSnapshotOf = (
  workspaces: WorkspaceSnapshot,
  tabs: readonly TabFixture[] = harnessTabs,
): StoreSnapshot => {
  const view = {
    focusedWorkspaceId: workspaces.focused,
    activeTabs: workspaces.ids.flatMap((id) => {
      const tab = tabs.find((known) => known.workspaceId === id);

      return tab === undefined ? [] : [{ workspaceId: id, tabId: tabId(tab.id) }];
    }),
    scrolls: [],
  };

  return {
    revision: 1,
    workspaces: workspaces.ids.map((id) => ({
      id,
      root: '/work',
      label: 'koja',
      tabIds: tabs.filter((tab) => tab.workspaceId === id).map((tab) => tabId(tab.id)),
    })),
    tabs: tabs.map((tab) => ({
      id: tabId(tab.id),
      workspaceId: tab.workspaceId,
      layout: rowLayout(tab.panes),
      arrangement: legacyArrangement(rowLayout(tab.panes)),
      focusedPaneId: tab.focused,
      zoomedPaneId: undefined,
      label: undefined,
    })),
    panes: tabs.flatMap((tab) =>
      tab.panes.map((pane) => ({
        id: pane,
        tabId: tabId(tab.id),
        lifecycle: 'running' as const,
        generation: 1,
        size,
        exitCode: undefined,
        startFolder: undefined,
        restored: false,
        error: undefined,
      })),
    ),
    defaultView: view,
    attachedClientId: clientId(1),
    foregroundClientId: clientId(1),
    clients: [{ id: clientId(1), size, theme: undefined, view }],
  };
};

export const decoder = new TextDecoder();
export const encoder = new TextEncoder();

const paneColumns = 10;
const lastPaneColumn = paneColumns - 1;
const screenColumns = paneColumns * 2;
const workspaceRowStart = 50;
const tabLabelStart = 60;
const tabLabelEnd = 70;
const chromeWorkspaceNumber = 7;
const chromeWorkspace = workspaceId(chromeWorkspaceNumber);

const afterSettled = (): Promise<void> => {
  const done = Promise.withResolvers<undefined>();

  setImmediate(() => {
    done.resolve(undefined);
  });

  return done.promise.then(() => undefined);
};

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
// to 59 and a tab label at columns 60 to 69.
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
  const view = createActionView(() => actionViewRowsOf(size.rows));
  const focusGate: { current: Promise<undefined> } = { current: Promise.resolve(undefined) };

  const snapshot: WorkspaceSnapshot = {
    ids: [firstWorkspace, secondWorkspace],
    focused: firstWorkspace,
  };

  const gone: GonePanes = {
    unplaced: new Set(),
    missing: new Set(),
    sizes: new Map(),
    replacedBy: new Map(),
  };

  const storeListeners = new Set<() => void>();
  let changedStore: StoreSnapshot | undefined;
  const store = (): StoreSnapshot => changedStore ?? storeSnapshotOf(snapshot);
  const clipboardReads: ClipboardReadFake[] = [];
  const pasteRequests: PasteRequest[] = [];
  const pasteAnswers: ((result: PanePasteResult) => void)[] = [];

  const pasteFlow = createPanePaste({
    snapshot: overrides.snapshot ?? store,
    subscribe: (listener) => {
      storeListeners.add(listener);

      return () => {
        storeListeners.delete(listener);
      };
    },
    view,
    readClipboard: (signal) => {
      const read = Promise.withResolvers<ClipboardReadResult>();

      clipboardReads.push({
        signal,
        settle: async (result) => {
          read.resolve(result);
          await afterSettled();
        },
      });

      return read.promise;
    },
    paste: (request) => {
      pasteRequests.push(request);

      const answer = Promise.withResolvers<PanePasteResult>();

      pasteAnswers.push(answer.resolve);

      return answer.promise;
    },
  });

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

      const under = paneId(x < paneColumns ? 1 : 2);

      return { paneId: gone.replacedBy.get(under) ?? under, column: x % paneColumns, row: y };
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
    catalog: actionCatalog,
    view,
    snapshot: store,
    pasteFlow,
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

  const changeStore = (next: StoreSnapshot): void => {
    changedStore = next;

    for (const listener of storeListeners) {
      listener();
    }
  };

  const replacePane = (pane: PaneId, replacement: PaneId | undefined): void => {
    const kept = (known: PaneId): PaneId[] => {
      if (known !== pane) {
        return [known];
      }

      return replacement === undefined ? [] : [replacement];
    };

    const remaining = harnessTabs.map((tab): TabFixture => {
      const panes = tab.panes.flatMap(kept);
      const focusedPane = panes.includes(tab.focused) ? tab.focused : panes[0];

      invariant(focusedPane !== undefined, 'a tab keeps a pane');

      return { id: tab.id, workspaceId: tab.workspaceId, panes, focused: focusedPane };
    });

    gone.unplaced.add(pane);
    gone.missing.add(pane);

    if (replacement !== undefined) {
      gone.replacedBy.set(pane, replacement);
    }

    changeStore(storeSnapshotOf(snapshot, remaining));
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
    view,
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
    changeStore,
    store,
    replacePane,
    clipboardReads,
    pasteRequests,
    answerPaste: async (result) => {
      pasteAnswers.shift()?.(result);
      await afterSettled();
    },
    pasteFlow,
  };
};
