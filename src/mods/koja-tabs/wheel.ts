export interface WheelGesture {
  accumulated: number;
  steps: number;
  at: number;
  last: number;
  direction: TabStep | null;
}

export interface WheelEvent {
  delta: { y: number };
  delta_lines?: { y: number } | undefined;
  touch_phase: 'started' | 'moved' | 'ended' | 'cancelled';
}

type TabStep = 'prev' | 'next';

interface WheelTurn {
  gesture: WheelGesture;
  step: TabStep | null;
}

const firstStep = 20;

const nextStep = 60;

const stepInterval = 100;

const pause = 250;

export const noWheelGesture: WheelGesture = {
  accumulated: 0,
  steps: 0,
  at: 0,
  last: 0,
  direction: null,
};

const direction = (delta: number): TabStep => (delta > 0 ? 'prev' : 'next');

const reversed = (gesture: WheelGesture, delta: number): boolean =>
  delta !== 0 && direction(delta) !== gesture.direction;

const restarted = (gesture: WheelGesture, event: WheelEvent, now: number): boolean =>
  event.touch_phase === 'started' || now - gesture.at > pause;

const restart = (gesture: WheelGesture, event: WheelEvent, now: number): WheelGesture => {
  if (restarted(gesture, event, now)) {
    return { ...noWheelGesture };
  }

  if (!reversed(gesture, event.delta.y)) {
    return gesture;
  }

  return { ...noWheelGesture, last: gesture.last };
};

export const wheelTurn = (gesture: WheelGesture, event: WheelEvent, now: number): WheelTurn => {
  if (event.delta_lines !== undefined) {
    const lines = event.delta_lines.y;

    return { gesture: { ...gesture }, step: lines === 0 ? null : direction(lines) };
  }

  const start = restart(gesture, event, now);
  const accumulated = start.accumulated + event.delta.y;
  const need = start.steps === 0 ? firstStep : nextStep;
  const soon = now - start.last < stepInterval;

  if (Math.abs(accumulated) < need || soon) {
    const held = accumulated === 0 ? start.direction : direction(accumulated);

    return { gesture: { ...start, accumulated, at: now, direction: held }, step: null };
  }

  return {
    gesture: {
      accumulated: accumulated - Math.sign(accumulated) * need,
      steps: start.steps + 1,
      at: now,
      last: now,
      direction: direction(accumulated),
    },
    step: direction(accumulated),
  };
};
