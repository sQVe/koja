import { describe, expect, test } from 'bun:test';

import { PreviewSession } from './previewQueue.ts';

const never = (): Promise<void> => new Promise(() => {});

const immediately = async (): Promise<void> => {};

const fixedSession = (id: string) => (): string => id;

describe('PreviewSession', () => {
  test('retries a failed write on the next selection', async () => {
    const writes: (string | null)[] = [];

    const session = new PreviewSession(async (_session, _sequence, address) => {
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

    const session = new PreviewSession(async (_session, _sequence, address) => {
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

    const session = new PreviewSession(async (_session, _sequence, address) => {
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

  test('waits for a running write inside the bound and then writes the clear', async () => {
    const writes: (string | null)[] = [];
    const first = Promise.withResolvers<boolean>();

    const session = new PreviewSession(async (_session, _sequence, address) => {
      writes.push(address);

      if (address === 'a') {
        return first.promise;
      }

      return true;
    });

    session.show('a');
    const closing = session.close(never);

    first.resolve(true);
    await closing;

    expect(writes).toEqual(['a', null]);
  });

  test('writes the clear when the running write passes the bound', async () => {
    const writes: (string | null)[] = [];
    const first = Promise.withResolvers<boolean>();

    const session = new PreviewSession(async (_session, _sequence, address) => {
      writes.push(address);

      if (address === 'a') {
        return first.promise;
      }

      return true;
    });

    session.show('a');
    await session.close(immediately);

    expect(writes).toEqual(['a', null]);

    first.resolve(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(writes).toEqual(['a', null]);
  });

  test('keeps writing after a deduplicated selection', async () => {
    const writes: (string | null)[] = [];

    const session = new PreviewSession(async (_session, _sequence, address) => {
      writes.push(address);

      return true;
    });

    session.show('a');
    await session.settled();
    session.show('a');
    await session.settled();
    session.show('b');
    await session.settled();
    await session.close(async () => {});

    expect(writes).toEqual(['a', 'b', null]);
  });

  test('counts each session from one and keeps its own id', async () => {
    const writes: { session: string; sequence: number; address: string | null }[] = [];

    const writer = async (
      session: string,
      sequence: number,
      address: string | null,
    ): Promise<boolean> => {
      writes.push({ session, sequence, address });

      return true;
    };

    const first = new PreviewSession(writer, fixedSession('sessionone'));

    first.show('a');
    await first.settled();
    await first.close(immediately);

    const second = new PreviewSession(writer, fixedSession('sessiontwo'));

    second.show('b');
    await second.settled();

    expect(writes).toEqual([
      { session: 'sessionone', sequence: 1, address: 'a' },
      { session: 'sessionone', sequence: 2, address: null },
      { session: 'sessiontwo', sequence: 1, address: 'b' },
    ]);
  });
});
