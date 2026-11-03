import { describe, expect, test } from 'bun:test';

import type { KeyboardHold, OverlayStatus } from './keyboardHold.ts';
import { createKeyboardHold, createStatusLookup } from './keyboardHold.ts';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface HoldHarness {
  hold: KeyboardHold;
  setFocused: (value: boolean) => void;
  advance: (milliseconds: number) => void;
  focusCalls: () => number;
  statusCalls: () => number;
}

const createDeferred = <T>(): Deferred<T> => {
  let resolveDeferred!: (value: T) => void;

  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });

  return { promise, resolve: resolveDeferred };
};

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const createHarness = (lookupStatus: () => Promise<OverlayStatus>): HoldHarness => {
  let focused = false;
  let focusCalls = 0;
  let statusCalls = 0;
  let currentTime = 0;

  const hold = createKeyboardHold({
    isFocused: () => focused,
    lookupStatus: () => {
      statusCalls += 1;

      return lookupStatus();
    },
    focus: () => {
      focusCalls += 1;
      focused = true;
    },
    now: () => currentTime,
  });

  return {
    hold,
    setFocused: (value) => {
      focused = value;
    },
    advance: (milliseconds) => {
      currentTime += milliseconds;
    },
    focusCalls: () => focusCalls,
    statusCalls: () => statusCalls,
  };
};

const statusLookup = (result: () => Promise<CommandResult>) => createStatusLookup(() => result());

const otherOverlay = JSON.stringify({ overlays: [{ name: 'koja-palette' }] });

const toastOverlay = JSON.stringify({ overlays: [{ name: 'toast' }] });

const noOverlay = JSON.stringify({ overlays: [] });

describe('keyboard hold', () => {
  test('does not look up the status while normal mode holds the keyboard', async () => {
    const harness = createHarness(async () => false);

    harness.setFocused(true);
    harness.hold.check();
    await flush();

    expect(harness.statusCalls()).toBe(0);
    expect(harness.focusCalls()).toBe(0);
  });

  test('runs at most one status lookup at a time', async () => {
    const deferred = createDeferred<OverlayStatus>();
    const harness = createHarness(() => deferred.promise);

    harness.hold.check();
    harness.hold.check();

    expect(harness.statusCalls()).toBe(1);

    deferred.resolve(false);
    await flush();

    expect(harness.focusCalls()).toBe(1);
  });

  test('takes focus back when the status shows no other overlay', async () => {
    const harness = createHarness(
      statusLookup(async () => ({ code: 0, stdout: noOverlay, stderr: '' })),
    );

    harness.hold.check();
    await flush();

    expect(harness.focusCalls()).toBe(1);
  });

  test('keeps the other overlay when the status lists one', async () => {
    const harness = createHarness(
      statusLookup(async () => ({ code: 0, stdout: otherOverlay, stderr: '' })),
    );

    harness.hold.check();
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });

  test('keeps the keyboard owner when the status exits nonzero', async () => {
    const harness = createHarness(
      statusLookup(async () => ({ code: 1, stdout: '', stderr: 'no' })),
    );

    harness.hold.check();
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });

  test('keeps the keyboard owner when the status JSON is malformed', async () => {
    const harness = createHarness(
      statusLookup(async () => ({ code: 0, stdout: 'not json', stderr: '' })),
    );

    harness.hold.check();
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });

  test('keeps the keyboard owner when the status lookup rejects', async () => {
    const harness = createHarness(async () => {
      throw new Error('exec could not start');
    });

    harness.hold.check();
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });

  test('does not take focus after normal mode closed during a pending lookup', async () => {
    const deferred = createDeferred<OverlayStatus>();
    const harness = createHarness(() => deferred.promise);

    harness.hold.check();
    harness.hold.close();
    deferred.resolve(false);
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });

  test('takes focus back when the status lists only a toast', async () => {
    const harness = createHarness(
      statusLookup(async () => ({ code: 0, stdout: toastOverlay, stderr: '' })),
    );

    harness.hold.check();
    await flush();

    expect(harness.focusCalls()).toBe(1);
  });

  test('keeps the keyboard owner when the status has no overlays array', async () => {
    const harness = createHarness(
      statusLookup(async () => ({ code: 0, stdout: '{"shown":true}', stderr: '' })),
    );

    harness.hold.check();
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });

  test('drops a status result made stale by a newer focus loss', async () => {
    const deferred = createDeferred<OverlayStatus>();
    const harness = createHarness(() => deferred.promise);

    harness.hold.check();
    harness.hold.regain();
    deferred.resolve(false);
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });

  test('drops a status result made stale by regained focus', async () => {
    const deferred = createDeferred<OverlayStatus>();
    const harness = createHarness(() => deferred.promise);

    harness.hold.check();
    harness.setFocused(true);
    harness.hold.check();
    deferred.resolve(false);
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });

  test('looks up once per focus loss and backs off while another overlay stays open', async () => {
    const harness = createHarness(
      statusLookup(async () => ({ code: 0, stdout: otherOverlay, stderr: '' })),
    );

    harness.hold.check();
    await flush();

    expect(harness.statusCalls()).toBe(1);
    expect(harness.focusCalls()).toBe(0);

    harness.hold.check();
    await flush();

    expect(harness.statusCalls()).toBe(1);

    harness.advance(50);
    harness.hold.check();
    await flush();

    expect(harness.statusCalls()).toBe(2);
  });

  test('consumes the self-caused authorization when the regain focus lands', async () => {
    const harness = createHarness(
      statusLookup(async () => ({ code: 0, stdout: otherOverlay, stderr: '' })),
    );

    harness.hold.regain();
    harness.hold.check();

    expect(harness.focusCalls()).toBe(1);
    expect(harness.statusCalls()).toBe(0);

    harness.setFocused(false);
    harness.hold.check();
    await flush();

    expect(harness.statusCalls()).toBe(1);
    expect(harness.focusCalls()).toBe(1);
  });

  test('does not take the keyboard when an overlay opens while the status is pending', async () => {
    const first = createDeferred<OverlayStatus>();
    const second = createDeferred<OverlayStatus>();
    let calls = 0;

    const harness = createHarness(() => {
      calls += 1;

      return calls === 1 ? first.promise : second.promise;
    });

    harness.setFocused(false);
    harness.hold.check();
    first.resolve(false);
    await flush();
    second.resolve(true);
    await flush();

    expect(harness.focusCalls()).toBe(0);
  });
});
