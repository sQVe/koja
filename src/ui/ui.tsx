import { createCliRenderer } from '@opentui/core';
import type { BoxRenderable, CliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { createClipboardQueue, viewedPane, shownView } from '../client/client.ts';
import type { AttachSession, ClipboardQueue, CloseReason, PaneNotice } from '../client/client.ts';
import { kittyFlags } from '../rows/rows.ts';
import { createInputRouter } from './input.ts';
import { takeStdin } from './inputStdin.ts';
import { runPaneAction } from './paneActions.ts';
import { mountPanes } from './paneLayer.ts';
import { placementOf, tabAt, targetAt, targetNear, workspaceAt } from './screenTargets.ts';
import { createScrollMode } from './scrollMode.ts';
import type { ScrollMode } from './scrollMode.ts';
import { StatusBar } from './statusBar.tsx';
import { createTerminalKeyboard } from './terminalKeyboard.ts';
import { createTerminalMouse } from './terminalMouse.ts';
import { themeFromDetectedColors } from './terminalTheme.ts';
import { SideList } from './workspaceList.tsx';

const emptyHint = 'No workspace is open. Run `koja workspace create <dir>` to start one.';

const Screen = ({
  session,
  placePane,
}: {
  session: AttachSession;
  placePane: (box: BoxRenderable | null) => void;
}): ReactNode => {
  const state = useSyncExternalStore(session.subscribe, session.getState);

  if (viewedPane(state.snapshot) === undefined) {
    return (
      <box flexGrow={1} alignItems="center" justifyContent="center">
        <text>{emptyHint}</text>
      </box>
    );
  }

  return <box ref={placePane} flexGrow={1} />;
};

const paletteTimeoutMs = 500;

const paletteSize = 16;

// A terminal that does not answer the color queries leaves the server's default colors in place.
const reportTheme = async (session: AttachSession, renderer: CliRenderer): Promise<void> => {
  const colors = await renderer.getPalette({ size: paletteSize, timeout: paletteTimeoutMs });
  const theme = themeFromDetectedColors(colors);

  if (theme !== undefined) {
    session.setTheme(theme);
  }
};

const paneModes = (session: AttachSession): number => {
  const current = viewedPane(session.getState().snapshot);

  return current === undefined ? 0 : (session.rowCache(current.id)?.modes() ?? 0);
};

const sendToPane = (session: AttachSession, bytes: Uint8Array): void => {
  const current = viewedPane(session.getState().snapshot);

  if (current !== undefined && bytes.length > 0) {
    session.sendInput(current.id, bytes);
  }
};

const routeInput = (session: AttachSession, renderer: CliRenderer, scrollMode: ScrollMode) =>
  createInputRouter({
    mode: () => session.getState().inputMode,
    setMode: (mode) => {
      session.setInputMode(mode);
    },
    modes: () => paneModes(session),
    send: (bytes) => {
      sendToPane(session, bytes);
    },
    mouseTarget: (x, y, pane) => {
      const placement = placementOf(session.getState().snapshot, {
        columns: renderer.terminalWidth,
        rows: renderer.terminalHeight,
      });

      return pane === undefined ? targetAt(placement, x, y) : targetNear(placement, pane, x, y);
    },
    focusedPane: () => viewedPane(session.getState().snapshot)?.id,
    chromeAt: (x, y) => {
      const { snapshot, inputMode } = session.getState();
      const terminal = { columns: renderer.terminalWidth, rows: renderer.terminalHeight };
      const workspaceId = workspaceAt(snapshot, terminal, { x, y });

      if (workspaceId !== undefined) {
        return { kind: 'workspace', workspaceId };
      }

      const number = tabAt(snapshot, inputMode, terminal, { x, y });

      return number === undefined ? undefined : { kind: 'tab', number };
    },
    focusPane: (pane) => session.focusPane(pane),
    paneModes: (pane) => session.rowCache(pane)?.modes() ?? 0,
    paneSize: (pane) => session.getState().snapshot.panes.find((known) => known.id === pane)?.size,
    sendToPane: (pane, bytes) => {
      session.sendInput(pane, bytes);
    },
    detach: session.detach,
    workspaces: () => {
      const { snapshot } = session.getState();

      return {
        ids: snapshot.workspaces.map((workspace) => workspace.id),
        focused: shownView(snapshot).focusedWorkspaceId,
      };
    },
    startDirectory: process.cwd(),
    command: session.sendWorkspaceCommand,
    tab: session.focusTab,
    tabPending: session.tabPending,
    afterTabAnswer: session.afterTabAnswer,
    paneAction: (action) => runPaneAction(session, action),
    scroll: scrollMode.handle,
  });

const showNotice = (notice: PaneNotice, clipboard: ClipboardQueue): void => {
  if (notice.kind === 'bell') {
    process.stdout.write('\u0007'.repeat(notice.count));

    return;
  }

  clipboard.copy(notice.text);
};

export const runAttach = async (session: AttachSession): Promise<CloseReason> => {
  // OpenTUI turns on Kitty key reporting for a null setting too. Koja asks for its own flags below,
  // so OpenTUI's stay off.
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: [],
    useKittyKeyboard: { disambiguate: false, alternateKeys: false },
    useMouse: false,
  });

  const scrollMode = createScrollMode(session);
  const keyboard = createTerminalKeyboard((text) => process.stdout.write(text));
  const mouse = createTerminalMouse((text) => process.stdout.write(text));
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
  let releaseStdin: (() => void) | undefined;
  let unsubscribeState: (() => void) | undefined;
  let unsubscribeRows: (() => void) | undefined;
  const clipboard = createClipboardQueue();
  let unsubscribeNotices: (() => void) | undefined;
  let root: ReturnType<typeof createRoot> | undefined;
  let unmountPane: (() => void) | undefined;

  const followPaneKeys = (): void => {
    keyboard.follow(kittyFlags(paneModes(session)));
  };

  const stop = (): void => {
    session.close();
  };

  const resize = (columns: number, rows: number): void => {
    session.resize({ columns, rows });
  };

  const releasePane = (): void => {
    const release = unmountPane;

    unmountPane = undefined;
    release?.();
  };

  const placePane = (box: BoxRenderable | null): void => {
    releasePane();

    if (box !== null) {
      unmountPane = mountPanes(session, renderer, box, scrollMode);
    }
  };

  // Cleanup runs after any step of the setup, so each step it undoes is optional here.
  try {
    releaseStdin = takeStdin(renderer, routeInput(session, renderer, scrollMode));
    unsubscribeState = session.subscribe(followPaneKeys);
    unsubscribeRows = session.subscribeRows(followPaneKeys);

    unsubscribeNotices = session.subscribeNotices((notice) => {
      showNotice(notice, clipboard);
    });

    followPaneKeys();
    mouse.enable();
    root = createRoot(renderer);

    for (const signal of signals) {
      process.on(signal, stop);
    }

    renderer.on('resize', resize);
    resize(renderer.terminalWidth, renderer.terminalHeight);

    reportTheme(session, renderer).catch(() => {
      // Detection is optional; the pane keeps the server's colors.
    });

    root.render(
      <box flexDirection="column" width="100%" height="100%">
        <box flexDirection="row" flexGrow={1}>
          <SideList session={session} />
          <Screen session={session} placePane={placePane} />
        </box>
        <StatusBar session={session} />
      </box>,
    );

    return await session.closed;
  } finally {
    for (const signal of signals) {
      process.off(signal, stop);
    }

    renderer.off('resize', resize);
    unsubscribeState?.();
    unsubscribeRows?.();
    unsubscribeNotices?.();
    clipboard.close();
    keyboard.restore();
    mouse.restore();
    releaseStdin?.();
    releasePane();
    root?.unmount();
    renderer.destroy();
    session.close();
  }
};
