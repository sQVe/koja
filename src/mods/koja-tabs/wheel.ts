import type { ScrollWheelEvent } from 'gpui-kit';

export interface WheelGesture {
  accumulated: number;
  steps: number;
  eventAt: number;
  /** Kept across a reversal, so the step interval holds while the wheel turns the other way. */
  stepAt: number;
  direction: TabStep | null;
}

type TabStep = 'prev' | 'next';

interface WheelTurn {
  gesture: WheelGesture;
  step: TabStep | null;
}

const firstStepPixels = 20;

const nextStepPixels = 60;

const stepIntervalMilliseconds = 100;

const pauseMilliseconds = 250;

export const noWheelGesture: WheelGesture = {
  accumulated: 0,
  steps: 0,
  eventAt: 0,
  stepAt: 0,
  direction: null,
};

const direction = (delta: number): TabStep => (delta > 0 ? 'prev' : 'next');

const reversed = (gesture: WheelGesture, delta: number): boolean =>
  delta !== 0 && direction(delta) !== gesture.direction;

const restarted = (gesture: WheelGesture, event: ScrollWheelEvent, now: number): boolean =>
  event.touch_phase === 'started' || now - gesture.eventAt > pauseMilliseconds;

const restart = (gesture: WheelGesture, event: ScrollWheelEvent, now: number): WheelGesture => {
  if (restarted(gesture, event, now)) {
    return { ...noWheelGesture };
  }

  if (!reversed(gesture, event.delta.y)) {
    return gesture;
  }

  return { ...noWheelGesture, stepAt: gesture.stepAt };
};

export const wheelTurn = (
  gesture: WheelGesture,
  event: ScrollWheelEvent,
  now: number,
): WheelTurn => {
  if (event.delta_lines !== undefined) {
    const lines = event.delta_lines.y;

    return { gesture: { ...gesture }, step: lines === 0 ? null : direction(lines) };
  }

  const start = restart(gesture, event, now);
  const accumulated = start.accumulated + event.delta.y;
  const need = start.steps === 0 ? firstStepPixels : nextStepPixels;
  const soon = now - start.stepAt < stepIntervalMilliseconds;

  if (Math.abs(accumulated) < need || soon) {
    const held = accumulated === 0 ? start.direction : direction(accumulated);

    return { gesture: { ...start, accumulated, eventAt: now, direction: held }, step: null };
  }

  return {
    gesture: {
      accumulated: accumulated - Math.sign(accumulated) * need,
      steps: start.steps + 1,
      eventAt: now,
      stepAt: now,
      direction: direction(accumulated),
    },
    step: direction(accumulated),
  };
};
