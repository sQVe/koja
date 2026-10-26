import type { PaneId } from '../ids.ts';
import type { MouseEvent } from './mouseEncoding.ts';
import type { PaneTarget } from './screenTargets.ts';

interface MouseCaptureHost {
  // The pane cell under an outer cell, or the cell of the given pane nearest to it.
  mouseTarget: (x: number, y: number, pane?: PaneId) => PaneTarget | undefined;
  // The pane's current size, or undefined once the pane is gone.
  paneSize: (pane: PaneId) => { columns: number; rows: number } | undefined;
}

interface MouseCapture {
  // Captures the button and pane of a press that starts a gesture, and returns whether it did.
  begin: (event: MouseEvent) => boolean;
  // Whether the event is a press, drag, or release of a button other than the captured one.
  ignores: (event: MouseEvent) => boolean;
  targetOf: (event: MouseEvent) => PaneTarget | undefined;
  unplacedRelease: (event: MouseEvent) => PaneTarget | undefined;
  // Remembers the forwarded target and ends the gesture on a release.
  finish: (event: MouseEvent, placed: PaneTarget | undefined) => void;
  // Ends the gesture on a release of the captured button that is not forwarded.
  drop: (event: MouseEvent) => void;
}

const isButtonGesture = (event: MouseEvent): boolean =>
  event.kind === 'press' || event.kind === 'drag' || event.kind === 'release';

export const createMouseCapture = (host: MouseCaptureHost): MouseCapture => {
  // The first press fixes the pane that gets its button's drags and release. Other buttons'
  // presses, drags, and releases are ignored until then.
  // `last` is the latest target forwarded to the pane. A release that finds the pane no longer
  // placed, such as after a tab switch or a zoom, goes there.
  let captured:
    | { button: number; pane: PaneId | undefined; last: PaneTarget | undefined }
    | undefined;

  const begin = (event: MouseEvent): boolean => {
    if (captured !== undefined || event.kind !== 'press') {
      return false;
    }

    const pressed = host.mouseTarget(event.x, event.y);

    captured = { button: event.button, pane: pressed?.paneId, last: pressed };

    return true;
  };

  const ignores = (event: MouseEvent): boolean =>
    captured !== undefined && isButtonGesture(event) && event.button !== captured.button;

  const targetOf = (event: MouseEvent): PaneTarget | undefined => {
    const followsPress = event.kind === 'drag' || event.kind === 'release';

    if (captured === undefined || !followsPress) {
      return host.mouseTarget(event.x, event.y);
    }

    return captured.pane === undefined
      ? undefined
      : host.mouseTarget(event.x, event.y, captured.pane);
  };

  // The saved cell, kept inside the pane's current size, which changes while the pane is hidden.
  const unplacedRelease = (event: MouseEvent): PaneTarget | undefined => {
    const last = captured?.last;

    if (event.kind !== 'release' || last === undefined) {
      return undefined;
    }

    const size = host.paneSize(last.paneId);

    if (size === undefined) {
      return undefined;
    }

    return {
      paneId: last.paneId,
      column: Math.min(last.column, size.columns - 1),
      row: Math.min(last.row, size.rows - 1),
    };
  };

  const finish = (event: MouseEvent, placed: PaneTarget | undefined): void => {
    const ownsGesture = isButtonGesture(event) && placed?.paneId === captured?.pane;

    if (captured !== undefined && ownsGesture) {
      captured.last = placed;
    }

    if (event.kind === 'release') {
      captured = undefined;
    }
  };

  const drop = (event: MouseEvent): void => {
    if (event.kind === 'release' && !ignores(event)) {
      captured = undefined;
    }
  };

  return { begin, ignores, targetOf, unplacedRelease, finish, drop };
};
