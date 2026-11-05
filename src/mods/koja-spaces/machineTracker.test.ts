import { afterAll, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../../tests/moduleFakes.ts';

interface ExecResultFake {
  code: number;
  stdout: string;
}

interface MachineLike {
  name: string;
  state: string | null;
}

interface MachineTrackerLike {
  lookup: () => MachineLike[];
  errorLine: () => string | null;
  refresh: (cx: unknown) => void;
  retry: (cx: unknown) => void;
}

let nextRead: () => Promise<ExecResultFake> = async () => ({ code: 0, stdout: '{"machines":[]}' });

await mock.module('herdr', () =>
  herdrFake({
    hc: async (_args: string[]) => nextRead(),
  }),
);

const modulePath = './machineTracker.ts';
const loaded = (await import(modulePath)) as { MachineTracker: new () => MachineTrackerLike };

const machineList = JSON.stringify({ machines: [{ name: 'work', state: 'connected' }] });

const spawned: Promise<void>[] = [];

const context = {
  spawn: (body: (cx: { notify: () => void }) => Promise<void>) => {
    spawned.push(body({ notify: () => undefined }));
  },
  notify: () => undefined,
};

const flush = async (): Promise<void> => {
  await Promise.all(spawned.splice(0));
};

afterAll(() => {
  mock.restore();
});

describe('MachineTracker', () => {
  test('a failed machine read keeps the old list and shows an error', async () => {
    const tracker = new loaded.MachineTracker();

    nextRead = async () => ({ code: 0, stdout: machineList });
    tracker.refresh(context);
    await flush();

    nextRead = async () => ({ code: 1, stdout: '' });
    tracker.refresh(context);
    await flush();

    expect(tracker.lookup()).toEqual([{ name: 'work', state: 'connected' }]);
    expect(tracker.errorLine()).toBe('Could not refresh machines.');
  });

  test('Retry clears the error after a good read', async () => {
    const tracker = new loaded.MachineTracker();

    expect(tracker.errorLine()).toBeNull();

    nextRead = async () => {
      throw new Error('the core is away');
    };

    tracker.refresh(context);
    await flush();

    expect(tracker.errorLine()).toBe('Could not read machines.');

    nextRead = async () => ({ code: 0, stdout: machineList });
    tracker.retry(context);
    await flush();

    expect(tracker.lookup()).toEqual([{ name: 'work', state: 'connected' }]);
    expect(tracker.errorLine()).toBeNull();
  });
});
