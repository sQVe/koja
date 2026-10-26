import { expect, it } from 'bun:test';

import { waitFor } from './serverProcesses.ts';

const trueAfter150Ms = async (): Promise<boolean> => {
  await Bun.sleep(150);

  return true;
};

it('waitFor returns true once a condition turns true before the deadline', async () => {
  let calls = 0;

  const met = await waitFor(() => {
    calls += 1;

    return calls === 3;
  }, 1000);

  expect({ met, calls }).toEqual({ met: true, calls: 3 });
});

it('waitFor returns false at the deadline when a condition never turns true', async () => {
  expect(await waitFor(() => false, 50)).toBe(false);
});

it('waitFor returns false at the deadline when an async condition never settles', async () => {
  const pending = new Promise<boolean>(() => {});

  expect(await waitFor(() => pending, 50)).toBe(false);
});

it('waitFor returns false when an async condition turns true only after the deadline', async () => {
  expect(await waitFor(trueAfter150Ms, 50)).toBe(false);
});
