import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { setupDataHost } from '../../tests/dataHostHarness.ts';

const dataHost = await setupDataHost();

afterAll(() => {
  mock.restore();
  setSystemTime();
});

beforeEach(() => {
  dataHost.reset();
});

describe('startDataHost with the window shown', () => {
  test('a visible but unfocused window still starts the periodic pull read', async () => {
    dataHost.window = { active: false, visible: true };

    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();
    copy.tick();
    await dataHost.settle();

    expect(dataHost.pullCalls()).toHaveLength(1);
  });
});

describe('startDataHost with the window hidden', () => {
  test('starts no periodic pull read in a tick while the window is hidden', async () => {
    dataHost.window = { active: true, visible: false };

    const copy = dataHost.startCopy();

    copy.tick();
    await dataHost.settle();
    copy.tick();
    await dataHost.settle();

    expect(dataHost.pullCalls()).toEqual([]);
  });
});
