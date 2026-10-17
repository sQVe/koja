import { expect, it } from 'bun:test';

import { createWriteQueue } from './writeQueue.ts';

// A socket that takes at most `room` bytes until the test gives it more.
const createSink = (room: number) => {
  const received: number[] = [];
  let available = room;

  return {
    received,
    grow: (bytes: number) => {
      available += bytes;
    },
    write: (bytes: Uint8Array): number => {
      const taken = Math.min(available, bytes.length);

      received.push(...bytes.subarray(0, taken));
      available -= taken;

      return taken;
    },
  };
};

it('writes bytes the socket took only in part once it drains, in order', () => {
  const sink = createSink(2);
  const queue = createWriteQueue(sink, 100);

  queue.send(Uint8Array.of(1, 2, 3));
  queue.send(Uint8Array.of(4, 5));

  expect(sink.received).toEqual([1, 2]);
  expect(queue.isEmpty()).toBe(false);

  sink.grow(2);
  queue.drain();

  expect(sink.received).toEqual([1, 2, 3, 4]);

  sink.grow(10);
  queue.drain();

  expect(sink.received).toEqual([1, 2, 3, 4, 5]);
  expect(queue.isEmpty()).toBe(true);
});

it('queues nothing while the socket takes every byte', () => {
  const sink = createSink(10);
  const queue = createWriteQueue(sink, 0);

  expect(queue.send(Uint8Array.of(1, 2, 3))).toEqual({ ok: true });
  expect(queue.isEmpty()).toBe(true);
});

it('refuses a send that would leave more than the limit queued', () => {
  const sink = createSink(0);
  const queue = createWriteQueue(sink, 4);

  expect(queue.send(Uint8Array.of(1, 2, 3))).toEqual({ ok: true });
  expect(queue.send(Uint8Array.of(4))).toEqual({ ok: true });
  expect(queue.send(Uint8Array.of(5))).toEqual({ ok: false, reason: 'queueFull' });
});

it('refuses a first send whose rest is over the limit', () => {
  const sink = createSink(1);
  const queue = createWriteQueue(sink, 2);

  expect(queue.send(Uint8Array.of(1, 2, 3, 4))).toEqual({ ok: false, reason: 'queueFull' });
});

it('treats a closed socket as one that took nothing', () => {
  const queue = createWriteQueue({ write: () => -1 }, 4);

  expect(queue.send(Uint8Array.of(1, 2))).toEqual({ ok: true });
  expect(queue.isEmpty()).toBe(false);
});

it('counts only the bytes the socket did not take when it took part of a send', () => {
  const queue = createWriteQueue(createSink(1), 3);

  expect(queue.send(Uint8Array.of(1, 2, 3, 4))).toEqual({ ok: true });
});

it('counts no bytes that a drain wrote when it checks the limit of the next send', () => {
  const sink = createSink(1);
  const queue = createWriteQueue(sink, 5);

  expect(queue.send(Uint8Array.of(1, 2, 3))).toEqual({ ok: true });

  sink.grow(2);
  queue.drain();

  expect(queue.isEmpty()).toBe(true);
  expect(queue.send(Uint8Array.of(4, 5, 6, 7, 8))).toEqual({ ok: true });
  expect(queue.send(Uint8Array.of(9))).toEqual({ ok: false, reason: 'queueFull' });
});
