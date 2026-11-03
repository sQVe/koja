import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import { herdrFake } from '../../tests/moduleFakes.ts';

let storedValue: unknown = undefined;

await mock.module('herdr', () =>
  herdrFake({
    setShared: (_key: string, value: unknown) => {
      storedValue = value;

      return null;
    },
    shared: () => storedValue,
  }),
);

const { overlayCloseCount, recordOverlayClose } = await import('./overlayOpen.ts');

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  storedValue = undefined;
});

describe('overlay close count', () => {
  test('starts at zero when nothing was recorded', () => {
    expect(overlayCloseCount()).toBe(0);
  });

  test('adds one for each recorded close', () => {
    recordOverlayClose();
    recordOverlayClose();

    expect(overlayCloseCount()).toBe(2);
  });

  test('reads a leftover value that is not a count as zero', () => {
    storedValue = ['old-owner'];

    expect(overlayCloseCount()).toBe(0);

    storedValue = 'closed';

    expect(overlayCloseCount()).toBe(0);
  });

  test('counts a close after a leftover value that is not a count', () => {
    storedValue = true;

    recordOverlayClose();

    expect(overlayCloseCount()).toBe(1);
  });
});
