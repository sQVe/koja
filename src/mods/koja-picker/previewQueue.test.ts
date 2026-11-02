import { describe, expect, test } from 'bun:test';

import { PreviewSession } from './previewQueue.ts';

describe('PreviewSession', () => {
  test('retries a failed write on the next selection', async () => {
    const writes: (string | null)[] = [];

    const session = new PreviewSession(async (address) => {
      writes.push(address);

      return false;
    });

    session.show('a');
    await session.settled();
    session.show('a');
    await session.settled();

    expect(writes).toEqual(['a', 'a']);
  });

  test('does not write a selection the preview already shows', async () => {
    const writes: (string | null)[] = [];

    const session = new PreviewSession(async (address) => {
      writes.push(address);

      return true;
    });

    session.show('a');
    await session.settled();
    session.show('a');
    await session.settled();

    expect(writes).toEqual(['a']);
  });

  test('coalesces selections made while a write is in flight', async () => {
    const writes: (string | null)[] = [];
    const first = Promise.withResolvers<undefined>();

    const session = new PreviewSession(async (address) => {
      writes.push(address);

      if (address === 'a') {
        await first.promise;
      }

      return true;
    });

    session.show('a');
    session.show('b');
    session.show('c');
    first.resolve(undefined);
    await session.settled();

    expect(writes).toEqual(['a', 'c']);
  });

  test('queues the close write after a running write', async () => {
    const writes: (string | null)[] = [];
    const first = Promise.withResolvers<undefined>();

    const session = new PreviewSession(async (address) => {
      writes.push(address);

      if (address === 'a') {
        await first.promise;
      }

      return true;
    });

    session.show('a');
    const closing = session.close();
    await Promise.resolve();

    expect(writes).toEqual(['a']);

    first.resolve(undefined);
    await closing;

    expect(writes).toEqual(['a', null]);
  });

  test('keeps writing after a deduplicated selection', async () => {
    const writes: (string | null)[] = [];

    const session = new PreviewSession(async (address) => {
      writes.push(address);

      return true;
    });

    session.show('a');
    await session.settled();
    session.show('a');
    await session.settled();
    session.show('b');
    await session.settled();
    await session.close();

    expect(writes).toEqual(['a', 'b', null]);
  });
});
