import type { InputMode, StoreSnapshot, TabRoute } from '../client/client.ts';
import type { PaneId, WorkspaceId } from '../ids.ts';
import { createMouseCapture } from './mouseCapture.ts';
import { encodeMouse, parseMouse } from './mouseEncoding.ts';
import type { MouseEvent } from './mouseEncoding.ts';
import type { PaneTarget } from './screenTargets.ts';
import type { createWorkspaceNavigation } from './workspaceNavigation.ts';

export type ChromeTarget =
  | { kind: 'workspace'; workspaceId: WorkspaceId }
  | { kind: 'tab'; number: number };

interface MouseRoutingHost {
  mode: () => InputMode;
  snapshot: () => StoreSnapshot;
  mouseTarget: (x: number, y: number, pane?: PaneId) => PaneTarget | undefined;
  paneSize: (pane: PaneId) => { columns: number; rows: number } | undefined;
  paneModes: (pane: PaneId) => number;
  sendToPane: (pane: PaneId, bytes: Uint8Array) => void;
  focusedPane: () => PaneId | undefined;
  focusPane: (pane: PaneId) => Promise<void>;
  chromeAt: (x: number, y: number) => ChromeTarget | undefined;
  tab: (route: TabRoute) => void;
}

type WorkspaceClicks = Pick<ReturnType<typeof createWorkspaceNavigation>, 'focusByClick'>;

interface MouseRouting {
  route: (raw: string) => Promise<void> | undefined;
  keep: (raw: string) => void;
  releaseGesture: () => void;
}

export const createMouseRouting = (
  host: MouseRoutingHost,
  navigation: WorkspaceClicks,
): MouseRouting => {
  const forwardMouse = (event: MouseEvent, target: PaneTarget, modes: number): boolean => {
    const bytes = encodeMouse(event, modes, target.column, target.row);

    if (bytes.length > 0) {
      host.sendToPane(target.paneId, bytes);
    }

    return bytes.length > 0;
  };

  const capture = createMouseCapture({
    snapshot: host.snapshot,
    mouseTarget: host.mouseTarget,
    paneSize: host.paneSize,
    paneModes: host.paneModes,
    forward: forwardMouse,
  });

  const focusChromeAt = (x: number, y: number): void => {
    const chrome = host.chromeAt(x, y);

    if (chrome === undefined) {
      return;
    }

    if (chrome.kind === 'tab') {
      host.tab({ kind: 'number', number: chrome.number });

      return;
    }

    navigation.focusByClick(chrome.workspaceId);
  };

  const modeSends = (event: MouseEvent): boolean =>
    event.kind === 'wheel' || host.mode() === 'insert';

  const route = (raw: string): Promise<void> | undefined => {
    const event = parseMouse(raw);

    if (event === undefined) {
      return undefined;
    }

    const step = capture.advance(event, modeSends(event));
    const startsLeftPress = step.startsPress && event.button === 0;

    if (startsLeftPress) {
      focusChromeAt(event.x, event.y);
    }

    const pressed = startsLeftPress ? step.pressed : undefined;

    if (pressed === undefined || pressed.paneId === host.focusedPane()) {
      return undefined;
    }

    return host.focusPane(pressed.paneId);
  };

  const keep = (raw: string): void => {
    const event = parseMouse(raw);

    if (event?.kind === 'release') {
      capture.advance(event, false);
    }
  };

  return { route, keep, releaseGesture: capture.releaseNow };
};
