import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';
import type { Heartbeat } from './lease.ts';
import {
  heartbeatIntervalMilliseconds,
  heartbeatKey,
  leaseExpiryMilliseconds,
  parseHeartbeat,
} from './lease.ts';
import { snapshotKey } from './snapshot.ts';

interface Copy {
  beat: () => void;
}

const sharedValues = new Map<string, unknown>();

let intervals: number[] = [];

await mock.module('herdr', () =>
  herdrFake({
    shared: (key: string) => sharedValues.get(key),
    setShared: (key: string, value: unknown) => {
      sharedValues.set(key, structuredClone(value));

      return null;
    },
  }),
);

const modulePath = './host.ts';

const loaded = (await import(modulePath)) as { startDataHost: (cx: unknown) => void };

afterAll(() => {
  mock.restore();
  setSystemTime();
});

const start = 1_800_000_000_000;

const startCopy = (): Copy => {
  const beats: (() => void)[] = [];

  const timer = {
    every: (milliseconds: number, handler: () => void) => {
      intervals.push(milliseconds);
      beats.push(handler);
    },
  };

  loaded.startDataHost({ timer });

  return {
    beat: () => {
      for (const beat of beats) {
        beat();
      }
    },
  };
};

const heartbeat = (): Heartbeat | null => parseHeartbeat(sharedValues.get(heartbeatKey));

beforeEach(() => {
  sharedValues.clear();
  intervals = [];
  setSystemTime(start);
});

describe('startDataHost', () => {
  test('claims generation 1 and publishes revision 1 of the empty snapshot at once', () => {
    startCopy();

    expect(heartbeat()).toMatchObject({ generation: 1, at: start });
    expect(sharedValues.get(snapshotKey)).toEqual({ version: 1, revision: 1, facts: {} });
  });

  test('renews the heartbeat on its timer every heartbeat interval', () => {
    const copy = startCopy();
    const renewedAt = start + heartbeatIntervalMilliseconds;

    setSystemTime(renewedAt);
    copy.beat();

    expect(intervals).toEqual([heartbeatIntervalMilliseconds]);
    expect(heartbeat()).toMatchObject({ generation: 1, at: renewedAt });
  });

  test('gives each copy its own owner', () => {
    startCopy();
    const first = heartbeat()?.owner;

    sharedValues.clear();
    startCopy();

    expect(heartbeat()?.owner).not.toBe(first);
  });

  test('leaves a live owner in place when a second copy starts', () => {
    startCopy();
    const first = heartbeat();

    setSystemTime(start + heartbeatIntervalMilliseconds);
    startCopy();

    expect(heartbeat()).toEqual(first);
  });

  test('lets a second copy take over with the next generation after the first stops renewing', () => {
    startCopy();
    const first = heartbeat()?.owner;
    const second = startCopy();
    const expiry = start + leaseExpiryMilliseconds;

    setSystemTime(expiry - 1);
    second.beat();

    expect(heartbeat()?.owner).toBe(first);

    setSystemTime(expiry);
    second.beat();

    expect(heartbeat()).toMatchObject({ generation: 2, at: expiry });
    expect(heartbeat()?.owner).not.toBe(first);
  });

  test('stops renewing in a copy whose lease was taken over', () => {
    const first = startCopy();
    const second = startCopy();
    const expiry = start + leaseExpiryMilliseconds;

    setSystemTime(expiry);
    second.beat();
    const taken = heartbeat();

    setSystemTime(expiry + 1);
    first.beat();

    expect(heartbeat()).toEqual(taken);
  });
});
