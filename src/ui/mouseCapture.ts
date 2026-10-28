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
  paneModes: (pane: PaneId) => number;
  forward: (event: MouseEvent, target: PaneTarget, modes: number) => boolean;
}

interface MouseStep {
  startsPress: boolean;
  pressed: PaneTarget | undefined;
}

interface MouseCapture {
  advance: (event: MouseEvent, modeSends: boolean) => MouseStep;
  releaseNow: () => void;
}

interface Capture {
  button: number;
  pane: PaneId | undefined;
  generation: number | undefined;
  modes: number;
  delivered: boolean;
  last: PaneTarget | undefined;
}

const isButtonGesture = (event: MouseEvent): boolean =>
  event.kind === 'press' || event.kind === 'drag' || event.kind === 'release';

const releaseOf = (button: number): MouseEvent => ({
  kind: 'release',
  button,
  shift: false,
  alt: false,
  ctrl: false,
  x: 0,
  y: 0,
});

const notPress: MouseStep = { startsPress: false, pressed: undefined };

export const createMouseCapture = (host: MouseCaptureHost): MouseCapture => {
  // The first press fixes the pane that gets its button's drags and release. Other buttons'
  // presses, drags, and releases are ignored until then.
  // `last` is the latest target forwarded to the pane. A release that finds the pane no longer
  // placed, such as after a tab switch or a zoom, goes there.
  // `modes` are the pane's mouse modes at the press. The pane's rows may be gone by the release,
  // so the gesture is encoded with these.
  let captured: Capture | undefined;

  const generationOf = (pane: PaneId | undefined): number | undefined =>
    host.snapshot().panes.find((known) => known.id === pane)?.generation;

  const stillDelivered = (gesture: Capture): boolean =>
    gesture.delivered && generationOf(gesture.pane) === gesture.generation;

  // The saved cell, kept inside the pane's current size, which changes while the pane is hidden.
  const lastCell = (gesture: Capture): PaneTarget | undefined => {
    const { last } = gesture;

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

  const modesOf = (target: PaneTarget | undefined): number =>
    target === undefined ? 0 : host.paneModes(target.paneId);

  const send = (
    event: MouseEvent,
    target: PaneTarget | undefined,
    sends: boolean,
    modes: number,
  ): boolean => sends && target !== undefined && host.forward(event, target, modes);

  const press = (event: MouseEvent, modeSends: boolean): MouseStep => {
    const pressed = host.mouseTarget(event.x, event.y);
    const pane = pressed?.paneId;
    const generation = generationOf(pane);
    const modes = modesOf(pressed);

    const delivered = send(event, pressed, modeSends, modes);

    captured = { button: event.button, pane, generation, modes, delivered, last: pressed };

    return { startsPress: true, pressed };
  };

  const follow = (event: MouseEvent, gesture: Capture): MouseStep => {
    const bound = event.kind === 'press' ? undefined : gesture.pane;
    const placed = host.mouseTarget(event.x, event.y, bound);
    const unplacedRelease = event.kind === 'release' ? lastCell(gesture) : undefined;
    const target = placed ?? unplacedRelease;

    gesture.delivered = stillDelivered(gesture);

    if (placed?.paneId === gesture.pane) {
      gesture.last = placed;
    }

    if (event.kind === 'release') {
      captured = undefined;
    }

    const modes = target?.paneId === gesture.pane ? gesture.modes : modesOf(target);

    send(event, target, gesture.delivered, modes);

    return notPress;
  };

  const advance = (event: MouseEvent, modeSends: boolean): MouseStep => {
    const gesture = captured;

    if (gesture === undefined && event.kind === 'press') {
      return press(event, modeSends);
    }

    // A drag or release reaches a pane only in a gesture whose press reached it.
    if (gesture === undefined || !isButtonGesture(event)) {
      const target = host.mouseTarget(event.x, event.y);

      send(event, target, modeSends && !isButtonGesture(event), modesOf(target));

      return notPress;
    }

    if (event.button !== gesture.button) {
      return notPress;
    }

    return follow(event, gesture);
  };

  const releaseNow = (): void => {
    const gesture = captured;

    captured = undefined;

    if (gesture !== undefined && stillDelivered(gesture)) {
      send(releaseOf(gesture.button), lastCell(gesture), true, gesture.modes);
    }
  };

  return { advance, releaseNow };
};
