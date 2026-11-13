import { afterAll, describe, expect, mock, test } from 'bun:test';

import { drawn, drawnTexts, drawnTree } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import type { DataState } from '../../data/consumer.ts';
import { readDataState } from '../../data/consumer.ts';
import { heartbeatKey, leaseExpiryMilliseconds } from '../../data/lease.ts';
import { snapshotKey } from '../../data/snapshot.ts';

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => ({}) }));

const kitFake = await realKitIndexFake([
  'age',
  'icon',
  'listRow',
  'size',
  'stateLine',
  'text',
  'textRole',
  'theme',
]);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './data.ts';

const loaded = (await import(modulePath)) as {
  dataLayer: (state: DataState, now: number) => DrawnElement[];
};

afterAll(() => {
  mock.restore();
});

const writtenAt = 1_000_000;

const sharedValues = {
  [snapshotKey]: { version: 1, revision: 3, facts: {} },
  [heartbeatKey]: { version: 1, owner: 'window-a', generation: 2, at: writtenAt },
};

const textsAt = (values: Record<string, unknown>, now: number): string[] => {
  const state = readDataState((key) => values[key], now);

  return drawnTexts(drawnTree(loaded.dataLayer(state, now)));
};

describe('dataLayer', () => {
  test('shows a live snapshot with its owner, generation, revision, and heartbeat age', () => {
    const texts = textsAt(sharedValues, writtenAt + 4000);

    expect(texts).toContain('Live');
    expect(texts).toContain('window-a');
    expect(texts).toContain('2');
    expect(texts).toContain('3');
    expect(texts).toContain('4s ago');
  });

  test('shows the snapshot as stale once the heartbeat is as old as the lease expiry', () => {
    const texts = textsAt(sharedValues, writtenAt + leaseExpiryMilliseconds);

    expect(texts).toContain('Stale');
    expect(texts).not.toContain('Live');
    expect(texts).toContain('window-a');
    expect(texts).toContain('30s ago');
  });

  test('shows a heartbeat older than a minute in minutes', () => {
    const texts = textsAt(sharedValues, writtenAt + 5 * 60_000);

    expect(texts).toContain('5m ago');
  });

  test('shows unavailable and no owner when no snapshot was written', () => {
    const texts = textsAt({ [heartbeatKey]: sharedValues[heartbeatKey] }, writtenAt);

    expect(texts).toContain('Unavailable');
    expect(texts).not.toContain('window-a');
  });
});
