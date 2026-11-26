import { describe, expect, test } from 'bun:test';

import { runTimersUntil, state } from './kojaSpacesView.ts';

describe('runTimersUntil', () => {
  test('skips a timer that never advances', () => {
    let calls = 0;

    state.timers = [
      {
        milliseconds: 0,
        handler: () => {
          calls += 1;

          if (calls > 3) {
            throw new Error('runTimersUntil kept running a zero-millisecond timer');
          }
        },
      },
    ];

    runTimersUntil(60_000);

    expect(calls).toBe(0);
  });
});
