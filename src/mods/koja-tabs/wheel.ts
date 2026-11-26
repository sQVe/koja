export interface WheelGesture {
  accumulated: number;
  steps: number;
  at: number;
  last: number;
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

// A wheel, a smooth-scrolling mouse, and a touchpad all report pixels, but a touchpad sends many
// small events per gesture. The first step needs little travel and each next one more, so a short
// swipe or one smoothed notch switches one tab and a longer swipe keeps going.
const firstStep = 20;

const nextStep = 60;

const stepInterval = 100;

// Phases often arrive only as moves, so a pause or a turn also starts a new gesture.
const pause = 250;

export const noWheelGesture: WheelGesture = { accumulated: 0, steps: 0, at: 0, last: 0 };

const direction = (delta: number): TabStep => (delta > 0 ? 'prev' : 'next');

const restarted = (gesture: WheelGesture, event: WheelEvent, now: number): boolean =>
  event.touch_phase === 'started' ||
  now - gesture.at > pause ||
  event.delta.y * gesture.accumulated < 0;

export const wheelTurn = (gesture: WheelGesture, event: WheelEvent, now: number): WheelTurn => {
  if (event.delta_lines !== undefined) {
    const lines = event.delta_lines.y;

    return { gesture, step: lines === 0 ? null : direction(lines) };
  }

  const start = restarted(gesture, event, now) ? noWheelGesture : gesture;
  const accumulated = start.accumulated + event.delta.y;
  const need = start.steps === 0 ? firstStep : nextStep;
  const soon = now - start.last < stepInterval;

  if (Math.abs(accumulated) < need || soon) {
    return { gesture: { ...start, accumulated, at: now }, step: null };
  }

  return {
    gesture: {
      accumulated: accumulated - Math.sign(accumulated) * need,
      steps: start.steps + 1,
      at: now,
      last: now,
    },
    step: direction(event.delta.y),
  };
};
