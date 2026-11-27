import { afterAll, describe, expect, mock, test } from 'bun:test';

import { drawn, drawnTexts } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { sidebarSize, spacing } from '../../kit/size.ts';

const themeColors = {
  foreground: '#111111',
  muted: '#222222',
  dim: '#666666',
};

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => themeColors }));

const kitParts = ['size', 'stateLine'];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './groupedList.ts';

const loaded = (await import(modulePath)) as {
  groupedList: (blocks: DrawnElement[][], loading: boolean) => DrawnElement[];
};

afterAll(() => {
  mock.restore();
});

const blockOf = (...labels: string[]): DrawnElement[] =>
  labels.map((label) => {
    const element = drawn();

    element.texts.push(label);

    return element;
  });

const textsOf = (blocks: DrawnElement[][], loading = false): string[][] =>
  loaded.groupedList(blocks, loading).map(drawnTexts);

describe('groupedList', () => {
  test('draws the first block without a gap before it', () => {
    expect(textsOf([blockOf('a', 'b')])).toEqual([['a'], ['b']]);
  });

  test('puts a gap between blocks and none after the last', () => {
    expect(textsOf([blockOf('a'), blockOf('b')])).toEqual([['a'], [], ['b']]);
  });

  test('draws the loading row when there are no blocks and the mod is loading', () => {
    expect(textsOf([], true)).toEqual([['Loading…']]);
  });

  test('draws nothing when there are no blocks and nothing waits', () => {
    expect(loaded.groupedList([], false)).toEqual([]);
  });

  test('keeps the projects a group gap apart, with the row gap on both sides of the spacer', () => {
    const rows = loaded.groupedList([blockOf('koja'), blockOf('tikk')], false);
    const gap = rows[1] as DrawnElement;

    expect(gap.styles['h']).toEqual([sidebarSize.groupGap - 2 * spacing.xxsmall]);
  });
});
