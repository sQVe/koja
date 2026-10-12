import { createCliRenderer } from '@opentui/core';
import type { BoxRenderable, CliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { focusedPane } from '../client/client.ts';
import type { AttachSession, CloseReason } from '../client/client.ts';
import { createInputRouter } from './input.ts';
import { mountPanes } from './paneLayer.ts';
import { SideList } from './sideList.tsx';
import { StatusBar } from './statusBar.tsx';
import { takeStdin } from './stdinInput.ts';
import { themeFromDetectedColors } from './terminalTheme.ts';

const emptyHint = 'No workspace is open. Run `phi workspace create <dir>` to start one.';

const Screen = ({
  session,
  placePane,
}: {
  session: AttachSession;
  placePane: (box: BoxRenderable | null) => void;
}): ReactNode => {
  const state = useSyncExternalStore(session.subscribe, session.getState);

  if (focusedPane(state.snapshot) === undefined) {
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
  const current = focusedPane(session.getState().snapshot);

  return current === undefined ? 0 : (session.rowCache(current.id)?.modes() ?? 0);
};

const sendToPane = (session: AttachSession, bytes: Uint8Array): void => {
  const current = focusedPane(session.getState().snapshot);

  if (current !== undefined && bytes.length > 0) {
    session.sendInput(current.id, bytes);
  }
};

const routeInput = (session: AttachSession) =>
  createInputRouter({
    mode: () => session.getState().inputMode,
    setMode: (mode) => {
      session.setInputMode(mode);
    },
    modes: () => paneModes(session),
    send: (bytes) => {
      sendToPane(session, bytes);
    },
    detach: session.detach,
    workspaces: () => {
      const { workspaces, focusedWorkspaceId } = session.getState().snapshot;

      return { ids: workspaces.map((workspace) => workspace.id), focused: focusedWorkspaceId };
    },
    startDirectory: process.cwd(),
    command: session.sendWorkspaceCommand,
    tab: session.focusTab,
    tabPending: session.tabPending,
    afterTabAnswer: session.afterTabAnswer,
  });

export const runAttach = async (session: AttachSession): Promise<CloseReason> => {
  // OpenTUI turns on Kitty key reporting for a null setting too. With every flag off, the terminal
  // sends the legacy key bytes the pane expects.
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: [],
    useKittyKeyboard: { disambiguate: false, alternateKeys: false },
    useMouse: false,
  });

  const releaseStdin = takeStdin(renderer, routeInput(session));

  const root = createRoot(renderer);
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
  let unmountPane: (() => void) | undefined;

  const stop = (): void => {
    session.close();
  };

  const resize = (columns: number, rows: number): void => {
    session.resize({ columns, rows });
  };

  const placePane = (box: BoxRenderable | null): void => {
    unmountPane?.();

    if (box !== null) {
      unmountPane = mountPanes(session, renderer, box);
    }
  };

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

  try {
    return await session.closed;
  } finally {
    for (const signal of signals) {
      process.off(signal, stop);
    }

    renderer.off('resize', resize);
    releaseStdin();
    unmountPane?.();
    root.unmount();
    renderer.destroy();
    session.close();
  }
};
