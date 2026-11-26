import { afterAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';

import { dataHost, setupDataHost } from '../../tests/dataHostHarness.ts';

await setupDataHost();

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
