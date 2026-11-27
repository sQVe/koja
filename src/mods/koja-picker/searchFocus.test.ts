import { describe, expect, test } from 'bun:test';

import { pick, seededRandom } from '../../../tests/seeded.ts';

interface SearchFocusInput {
  focus: () => void;
  on: (event: string, handler: () => void) => boolean;
}

interface SearchFocusHost {
  input: SearchFocusInput;
  isSearchFocused: () => boolean;
  setSearchFocused: (focused: boolean) => void;
  isLeaving: () => boolean;
}

interface Context {
  timer: {
    after: (delay: number, handler: (cx: Context) => void) => unknown;
  };
}

interface FakeInput extends SearchFocusInput {
  focusCalls: number;
  emit: (event: string) => void;
}

interface FakeTask {
  cancel: () => void;
  is_done: () => boolean;
}

interface TimerEntry {
  cancelled: boolean;
  done: boolean;
  run: () => void;
}

interface FakeTimer {
  delays: number[];
  queued: TimerEntry[];
  after: (delay: number, handler: (cx: Context) => void) => FakeTask;
  pending: () => number;
  live: () => TimerEntry[];
}

interface Harness {
  host: SearchFocusHost;
  input: FakeInput;
  state: { focused: boolean; leaving: boolean };
  timer: FakeTimer;
  context: Context;
}

const modulePath = './searchFocus.ts';

const loaded = (await import(modulePath)) as {
  keepSearchFocused: (host: SearchFocusHost, cx: Context) => void;
};

const keepSearchFocused = loaded.keepSearchFocused;

const runPending = (timer: FakeTimer): void => {
  timer.live()[0]?.run();
};

const setup = (): Harness => {
  const handlers: Record<string, (() => void) | undefined> = {};

  const input: FakeInput = {
    focusCalls: 0,
    focus: () => {
      input.focusCalls += 1;
    },
    on: (event, handler) => {
      handlers[event] = handler;

      return true;
    },
    emit: (event) => {
      handlers[event]?.();
    },
  };

  const state = { focused: false, leaving: false };

  const host: SearchFocusHost = {
    input,
    isSearchFocused: () => state.focused,
    setSearchFocused: (next) => {
      state.focused = next;
    },
    isLeaving: () => state.leaving,
  };

  const delays: number[] = [];
  const queued: TimerEntry[] = [];

  const live = (): TimerEntry[] => queued.filter((entry) => !entry.cancelled && !entry.done);

  const timer: FakeTimer = {
    delays,
    queued,
    after: (delay, handler) => {
      delays.push(delay);

      const entry: TimerEntry = {
        cancelled: false,
        done: false,
        run: () => {
          if (entry.cancelled || entry.done) {
            return;
          }

          entry.done = true;
          handler(context);
        },
      };

      queued.push(entry);

      return {
        cancel: () => {
          entry.cancelled = true;
        },
        is_done: () => entry.done,
      };
    },
    pending: () => live().length,
    live,
  };

  const context = { timer } as unknown as Context;

  return { host, input, state, timer, context };
};

describe('keepSearchFocused', () => {
  test('focuses the input at once and schedules a retry', () => {
    const { host, input, timer, context } = setup();

    keepSearchFocused(host, context);

    expect(input.focusCalls).toBe(1);
    expect(timer.delays).toEqual([50]);
  });

  test('focuses again on a retry while the input is not focused', () => {
    const { host, input, timer, context } = setup();

    keepSearchFocused(host, context);
    runPending(timer);

    expect(input.focusCalls).toBe(2);
    expect(timer.delays).toHaveLength(2);
  });

  test('sets the focused state on a focus event', () => {
    const { host, input, state, context } = setup();

    keepSearchFocused(host, context);
    input.emit('focus');

    expect(state.focused).toBe(true);
  });

  test('stops retrying once the input reports focus', () => {
    const { host, input, timer, context } = setup();

    keepSearchFocused(host, context);
    input.emit('focus');
    runPending(timer);

    expect(input.focusCalls).toBe(1);
    expect(timer.delays).toHaveLength(1);
  });

  test('stops retrying when the picker is leaving', () => {
    const { host, input, state, timer, context } = setup();

    keepSearchFocused(host, context);
    state.leaving = true;
    runPending(timer);

    expect(input.focusCalls).toBe(1);
    expect(timer.delays).toHaveLength(1);
  });

  test('gives up after 40 focus attempts', () => {
    const { host, input, timer, context } = setup();

    keepSearchFocused(host, context);

    for (let index = 0; index < 41; index += 1) {
      runPending(timer);
    }

    expect(input.focusCalls).toBe(40);
    expect(timer.delays).toHaveLength(40);
  });

  test('clears the focused state and starts a fresh round on blur', () => {
    const { host, input, state, timer, context } = setup();

    keepSearchFocused(host, context);
    input.emit('focus');
    input.emit('blur');

    expect(state.focused).toBe(false);
    expect(input.focusCalls).toBe(2);
    expect(timer.delays).toHaveLength(2);
  });

  test('a blur supersedes retries still pending from an earlier focus attempt', () => {
    const { host, input, timer, context } = setup();

    keepSearchFocused(host, context);
    input.emit('blur');

    expect(timer.pending()).toBe(1);

    const [superseded, liveRetry] = timer.queued;

    superseded?.run();
    expect(input.focusCalls).toBe(2);
    expect(timer.pending()).toBe(1);

    liveRetry?.run();
    expect(input.focusCalls).toBe(3);
    expect(timer.pending()).toBe(1);
  });

  test('random focus, blur, and timer runs leave at most one retry pending', () => {
    const actions = [0, 1, 2] as const;
    let sawRetry = false;

    for (let seed = 1; seed <= 50; seed += 1) {
      const { host, input, timer, context } = setup();
      const random = seededRandom(seed);

      keepSearchFocused(host, context);

      for (let step = 0; step < 30; step += 1) {
        const action = pick(actions, random);

        if (action === 0) {
          input.emit('focus');
        } else if (action === 1) {
          input.emit('blur');
        } else {
          const entries = timer.live();

          if (entries.length > 0) {
            pick(entries, random).run();
            sawRetry = true;
          }
        }

        expect(timer.pending(), `seed ${seed}: more than one retry waits`).toBeLessThanOrEqual(1);

        if (host.isSearchFocused()) {
          expect(timer.pending(), `seed ${seed}: a retry waits while focused`).toBe(0);
        }
      }
    }

    expect(sawRetry, 'no retry ever ran').toBe(true);
  });
});
