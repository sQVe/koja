import { describe, expect, test } from 'bun:test';

import type { WheelEvent, WheelGesture } from './wheel.ts';
import { noWheelGesture, wheelTurn } from './wheel.ts';

const pixels = (y: number): WheelEvent => ({ delta: { y }, touch_phase: 'moved' });

const lines = (y: number): WheelEvent => ({
  delta: { y: 0 },
  delta_lines: { y },
  touch_phase: 'moved',
});

const started = (y: number): WheelEvent => ({ delta: { y }, touch_phase: 'started' });

const turned = (
  gesture: WheelGesture,
  events: WheelEvent[],
  from: number,
  gap = 200,
): WheelGesture =>
  events.reduce(
    (current, event, index) => wheelTurn(current, event, from + index * gap).gesture,
    gesture,
  );

describe('wheelTurn', () => {
  test('switches one tab per reported line, at once', () => {
    expect(wheelTurn(noWheelGesture, lines(3), 1000).step).toBe('prev');
    expect(wheelTurn(noWheelGesture, lines(-1), 1000).step).toBe('next');
  });

  test('reads a downward scroll as the tab before and an upward one as the tab after', () => {
    expect(wheelTurn(noWheelGesture, pixels(20), 1000).step).toBe('prev');
    expect(wheelTurn(noWheelGesture, pixels(-20), 1000).step).toBe('next');
  });

  test('switches the first tab after 20 px and each next one after 60 px more', () => {
    const first = wheelTurn(noWheelGesture, pixels(19), 1000);

    expect(first.step).toBeNull();
    expect(wheelTurn(first.gesture, pixels(1), 1200).step).toBe('prev');

    const short = turned(noWheelGesture, [pixels(20), pixels(59)], 1000);

    expect(wheelTurn(short, pixels(0), 1200).step).toBeNull();
    expect(wheelTurn(short, pixels(1), 1200).step).toBe('prev');
  });

  test('switches at most one tab every 100 ms', () => {
    const first = wheelTurn(noWheelGesture, pixels(20), 1000);

    expect(wheelTurn(first.gesture, pixels(60), 1050).step).toBeNull();
    expect(wheelTurn(first.gesture, pixels(60), 1100).step).toBe('prev');
  });

  test('starts a new gesture after a pause, so 20 px switches again', () => {
    const after = turned(noWheelGesture, [pixels(20), pixels(60)], 1000);

    expect(wheelTurn(after, pixels(20), 1500).step).toBe('prev');
  });

  test('starts a new gesture when the touch reports its start', () => {
    const after = turned(noWheelGesture, [pixels(20), pixels(60)], 1000);

    expect(wheelTurn(after, started(20), 1050).step).toBe('prev');
  });

  test('starts a new gesture when the direction turns', () => {
    const after = turned(noWheelGesture, [pixels(100)], 1000);

    expect(wheelTurn(after, pixels(-30), 1200).step).toBe('next');
  });

  test('keeps a gesture that holds no travel yet', () => {
    const after = turned(noWheelGesture, [pixels(100)], 1000);

    expect(after.steps).toBe(1);
    expect(after.accumulated).toBe(80);
  });
});
