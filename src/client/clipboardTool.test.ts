import { afterEach, expect, it, jest, spyOn } from 'bun:test';

import { stopTool, waitForOutcome } from './clipboardTool.ts';

afterEach(() => {
  jest.useRealTimers();
});

it('leaves no timer behind once the work finishes', async () => {
  jest.useFakeTimers();

  const work = Promise.withResolvers<number>();
  const pending = waitForOutcome(work.promise, 2000, undefined);
  const timersWhileRunning = jest.getTimerCount();

  work.resolve(0);

  expect(await pending).toBe(0);
  expect(timersWhileRunning).toBe(1);
  expect(jest.getTimerCount()).toBe(0);
});

const trackedSignal = () => {
  const attached: { type: string; listener: unknown }[] = [];
  const signal = new AbortController().signal;

  signal.addEventListener = (type: string, listener: unknown) => {
    attached.push({ type, listener });
  };

  signal.removeEventListener = (type: string, listener: unknown) => {
    const index = attached.findIndex((entry) => entry.type === type && entry.listener === listener);

    if (index !== -1) {
      attached.splice(index, 1);
    }
  };

  return { signal, attached };
};

it('leaves no abort listener on a reused signal once the work finishes', async () => {
  const { signal, attached } = trackedSignal();
  const work = Promise.withResolvers<number>();
  const pending = waitForOutcome(work.promise, 2000, signal);
  const typesWhileRunning = attached.map((entry) => entry.type);

  work.resolve(0);
  await pending;

  expect(typesWhileRunning).toEqual(['abort']);
  expect(attached).toEqual([]);
});

it('never signals the tool group once the tool has been reaped', async () => {
  const exited = Bun.spawn(['sh', '-c', 'exit 3'], { detached: true });
  const killed = Bun.spawn(['sh', '-c', 'kill -9 $$'], { detached: true });

  await Promise.all([exited.exited, killed.exited]);

  const kill = spyOn(process, 'kill');

  try {
    await stopTool(exited);
    await stopTool(killed);

    expect(kill).not.toHaveBeenCalled();
  } finally {
    kill.mockRestore();
  }
});
