import { createCliRenderer } from '@opentui/core';
import type { BoxRenderable, CliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { viewedPane, shownView } from '../client/client.ts';
import type { AttachSession, CloseReason } from '../client/client.ts';
import { layoutPanes } from '../layout.ts';
import { kittyFlags } from '../rows/rows.ts';
import { createInputRouter } from './input.ts';
import type { PaneAction } from './input.ts';
import { takeStdin } from './inputStdin.ts';
import { mountPanes } from './paneLayer.ts';
import { placementOf, targetAt, targetNear } from './screenTargets.ts';
import { StatusBar } from './statusBar.tsx';
import { createTerminalKeyboard } from './terminalKeyboard.ts';
import { createTerminalMouse } from './terminalMouse.ts';
import { themeFromDetectedColors } from './terminalTheme.ts';
import { SideList } from './workspaceList.tsx';

const emptyHint = 'No workspace is open. Run `phi workspace create <dir>` to start one.';

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

const focusNeighbor = (session: AttachSession, offset: number): Promise<void> => {
  const { snapshot } = session.getState();
  const current = viewedPane(snapshot);
  const tab = snapshot.tabs.find((known) => known.id === current?.tabId);

  if (current === undefined || tab === undefined) {
    return Promise.resolve();
  }

  const order = layoutPanes(tab.layout, { columns: 1, rows: 1 }).map((place) => place.paneId);
  const target = order[order.indexOf(current.id) + offset];

  return target === undefined ? Promise.resolve() : session.focusPane(target);
};

const resizeDirections: Partial<Record<PaneAction, 'left' | 'right' | 'up' | 'down'>> = {
  resizeLeft: 'left',
  resizeRight: 'right',
  resizeUp: 'up',
  resizeDown: 'down',
};

const runPaneAction = (session: AttachSession, action: PaneAction): Promise<void> => {
  const current = viewedPane(session.getState().snapshot);

  if (current === undefined) {
    return Promise.resolve();
  }

  if (action === 'splitBelow') {
    return session.splitPane(current.id, 'below');
  }

  if (action === 'splitRight') {
    return session.splitPane(current.id, 'right');
  }

  if (action === 'close') {
    return session.closePane(current.id);
  }

  if (action === 'breakPane') {
    return session.movePane(current.id, { kind: 'newTab' });
  }

  if (action === 'zoom') {
    return session.zoomPane(current.id);
  }

  const resizeDirection = resizeDirections[action];

  if (resizeDirection !== undefined) {
    return session.resizePane(current.id, resizeDirection, 1);
  }

  return focusNeighbor(session, action === 'focusPrevious' ? -1 : 1);
};

const routeInput = (session: AttachSession, renderer: CliRenderer) =>
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
    paneModes: (pane) => session.rowCache(pane)?.modes() ?? 0,
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
  });

export const runAttach = async (session: AttachSession): Promise<CloseReason> => {
  // OpenTUI turns on Kitty key reporting for a null setting too. Phi asks for its own flags below,
  // so OpenTUI's stay off.
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: [],
    useKittyKeyboard: { disambiguate: false, alternateKeys: false },
    useMouse: false,
  });

  const keyboard = createTerminalKeyboard((text) => process.stdout.write(text));
  const mouse = createTerminalMouse((text) => process.stdout.write(text));
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
  let releaseStdin: (() => void) | undefined;
  let unsubscribeState: (() => void) | undefined;
  let unsubscribeRows: (() => void) | undefined;
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
      unmountPane = mountPanes(session, renderer, box);
    }
  };

  // Cleanup runs after any step of the setup, so each step it undoes is optional here.
  try {
    releaseStdin = takeStdin(renderer, routeInput(session, renderer));
    unsubscribeState = session.subscribe(followPaneKeys);
    unsubscribeRows = session.subscribeRows(followPaneKeys);
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
    keyboard.restore();
    mouse.restore();
    releaseStdin?.();
    releasePane();
    root?.unmount();
    renderer.destroy();
    session.close();
  }
};
