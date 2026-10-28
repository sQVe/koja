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
  // The pane cell under an outer cell, or the cell of the given pane nearest to it.
  mouseTarget: (x: number, y: number, pane?: PaneId) => PaneTarget | undefined;
  // The pane's current size, or undefined once the pane is gone.
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
  // The promise settles once a click has focused its pane.
  route: (raw: string) => Promise<void> | undefined;
  // Handles a report Koja keeps from the panes. Only the release of a delivered gesture gets through.
  keep: (raw: string) => void;
  // Sends the release of a delivered gesture to its pane, so the pane keeps no pressed button.
  releaseGesture: () => void;
}

// The press decides whether a gesture reaches its pane: only an insert-mode press does. Events
// outside a gesture follow the current mode, except the wheel, which reaches the pane in every mode.
export const createMouseRouting = (
  host: MouseRoutingHost,
  navigation: WorkspaceClicks,
): MouseRouting => {
  const capture = createMouseCapture(host);

  const forwardMouse = (event: MouseEvent, target: PaneTarget): void => {
    const bytes = encodeMouse(event, host.paneModes(target.paneId), target.column, target.row);

    if (bytes.length > 0) {
      host.sendToPane(target.paneId, bytes);
    }
  };

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

  const reachesPane = (event: MouseEvent): boolean => {
    const delivery = capture.deliveryOf(event);

    if (delivery === 'none') {
      return event.kind === 'wheel' || host.mode() === 'insert';
    }

    return delivery === 'delivered';
  };

  // Sends the event to its pane when it reaches the pane, and returns the pane cell it is over.
  const forwardEvent = (event: MouseEvent): PaneTarget | undefined => {
    const sends = reachesPane(event);
    const placedTarget = capture.targetOf(event);
    const target = placedTarget ?? capture.unplacedRelease(event);

    capture.finish(event, placedTarget);

    if (sends && target !== undefined) {
      forwardMouse(event, target);
    }

    return target;
  };

  const routeEvent = (event: MouseEvent): Promise<void> | undefined => {
    const startsLeftPress = capture.begin(event, host.mode() === 'insert') && event.button === 0;

    if (startsLeftPress) {
      focusChromeAt(event.x, event.y);
    }

    const target = forwardEvent(event);

    if (target === undefined) {
      return undefined;
    }

    const unfocused = target.paneId !== host.focusedPane();

    return startsLeftPress && unfocused ? host.focusPane(target.paneId) : undefined;
  };

  const route = (raw: string): Promise<void> | undefined => {
    const event = parseMouse(raw);

    if (event === undefined || capture.ignores(event)) {
      return undefined;
    }

    return routeEvent(event);
  };

  const keep = (raw: string): void => {
    const event = parseMouse(raw);
    const release = event?.kind === 'release' ? event : undefined;

    if (release === undefined || capture.ignores(release)) {
      return;
    }

    if (capture.deliveryOf(release) !== 'none') {
      forwardEvent(release);
    }
  };

  const releaseGesture = (): void => {
    const release = capture.releaseNow();

    if (release !== undefined) {
      forwardMouse(release.event, release.target);
    }
  };

  return { route, keep, releaseGesture };
};
