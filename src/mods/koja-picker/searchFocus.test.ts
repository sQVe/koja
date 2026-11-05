import { describe, expect, test } from 'bun:test';

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

interface FakeTimer {
  delays: number[];
  runs: (() => void)[];
  after: (delay: number, handler: (cx: Context) => void) => unknown;
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
  const runs: (() => void)[] = [];

  const timer: FakeTimer = {
    delays,
    runs,
    after: (delay, handler) => {
      delays.push(delay);

      runs.push(() => {
        handler(context);
      });

      return { cancel: () => {}, is_done: () => true };
    },
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
    timer.runs[0]?.();

    expect(input.focusCalls).toBe(2);
    expect(timer.runs).toHaveLength(2);
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
    timer.runs[0]?.();

    expect(input.focusCalls).toBe(1);
    expect(timer.runs).toHaveLength(1);
  });

  test('stops retrying when the picker is leaving', () => {
    const { host, input, state, timer, context } = setup();

    keepSearchFocused(host, context);
    state.leaving = true;
    timer.runs[0]?.();

    expect(input.focusCalls).toBe(1);
    expect(timer.runs).toHaveLength(1);
  });

  test('gives up after 40 focus attempts', () => {
    const { host, input, timer, context } = setup();

    keepSearchFocused(host, context);

    for (let index = 0; index < 41; index += 1) {
      timer.runs[index]?.();
    }

    expect(input.focusCalls).toBe(40);
    expect(timer.runs).toHaveLength(40);
  });

  test('clears the focused state and starts a fresh round on blur', () => {
    const { host, input, state, timer, context } = setup();

    keepSearchFocused(host, context);
    input.emit('focus');
    input.emit('blur');

    expect(state.focused).toBe(false);
    expect(input.focusCalls).toBe(2);
    expect(timer.runs).toHaveLength(2);
  });
});
