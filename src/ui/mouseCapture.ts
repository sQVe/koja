import type { StoreSnapshot } from '../client/client.ts';
import type { PaneId } from '../ids.ts';
import type { MouseEvent } from './mouseEncoding.ts';
import type { PaneTarget } from './screenTargets.ts';

interface MouseCaptureHost {
  snapshot: () => StoreSnapshot;
  // The pane cell under an outer cell, or the cell of the given pane nearest to it.
  mouseTarget: (x: number, y: number, pane?: PaneId) => PaneTarget | undefined;
  // The pane's current size, or undefined once the pane is gone.
  paneSize: (pane: PaneId) => { columns: number; rows: number } | undefined;
}

// Whether an event belongs to no gesture, to a gesture whose events reach its pane, or to a
// gesture whose events reach no pane.
type GestureDelivery = 'none' | 'delivered' | 'withheld';

interface MouseCapture {
  // Captures the button, pane, and delivery of a press that starts a gesture, and returns whether
  // it did.
  begin: (event: MouseEvent, delivered: boolean) => boolean;
  // Whether the event is a press, drag, or release of a button other than the captured one.
  ignores: (event: MouseEvent) => boolean;
  deliveryOf: (event: MouseEvent) => GestureDelivery;
  targetOf: (event: MouseEvent) => PaneTarget | undefined;
  unplacedRelease: (event: MouseEvent) => PaneTarget | undefined;
  // The release of the delivered gesture at its last cell, which ends the gesture.
  releaseNow: () => { event: MouseEvent; target: PaneTarget } | undefined;
  // Remembers the forwarded target and ends the gesture on a release.
  finish: (event: MouseEvent, placed: PaneTarget | undefined) => void;
  drop: (event: MouseEvent) => void;
}

interface Capture {
  button: number;
  pane: PaneId | undefined;
  generation: number | undefined;
  delivered: boolean;
  last: PaneTarget | undefined;
}

const isButtonGesture = (event: MouseEvent): boolean =>
  event.kind === 'press' || event.kind === 'drag' || event.kind === 'release';

export const createMouseCapture = (host: MouseCaptureHost): MouseCapture => {
  // The first press fixes the pane that gets its button's drags and release. Other buttons'
  // presses, drags, and releases are ignored until then.
  // `last` is the latest target forwarded to the pane. A release that finds the pane no longer
  // placed, such as after a tab switch or a zoom, goes there.
  let captured: Capture | undefined;

  const generationOf = (pane: PaneId | undefined): number | undefined =>
    host.snapshot().panes.find((known) => known.id === pane)?.generation;

  const begin = (event: MouseEvent, delivered: boolean): boolean => {
    if (captured !== undefined || event.kind !== 'press') {
      return false;
    }

    const pressed = host.mouseTarget(event.x, event.y);
    const pane = pressed?.paneId;

    captured = {
      button: event.button,
      pane,
      generation: generationOf(pane),
      delivered,
      last: pressed,
    };

    return true;
  };

  const ignores = (event: MouseEvent): boolean =>
    captured !== undefined && isButtonGesture(event) && event.button !== captured.button;

  // A gesture whose pane is gone or runs another generation sends nothing more until its release.
  const deliveryOf = (event: MouseEvent): GestureDelivery => {
    if (captured === undefined || !isButtonGesture(event)) {
      return 'none';
    }

    const replaced = generationOf(captured.pane) !== captured.generation;

    if (replaced) {
      captured.delivered = false;
    }

    return captured.delivered ? 'delivered' : 'withheld';
  };

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
  const lastCell = (): PaneTarget | undefined => {
    const last = captured?.last;

    if (last === undefined) {
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

  const unplacedRelease = (event: MouseEvent): PaneTarget | undefined =>
    event.kind === 'release' ? lastCell() : undefined;

  const releaseNow = (): { event: MouseEvent; target: PaneTarget } | undefined => {
    if (captured === undefined) {
      return undefined;
    }

    const event: MouseEvent = {
      kind: 'release',
      button: captured.button,
      shift: false,
      alt: false,
      ctrl: false,
      x: 0,
      y: 0,
    };

    const target = deliveryOf(event) === 'delivered' ? lastCell() : undefined;

    captured = undefined;

    return target === undefined ? undefined : { event, target };
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

  return { begin, ignores, deliveryOf, targetOf, unplacedRelease, releaseNow, finish, drop };
};
