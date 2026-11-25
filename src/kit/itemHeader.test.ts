import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, elementWithText, spinning } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import { textSize } from './size.ts';

type ItemStateKind = 'openPullRequest' | 'inProgress' | 'inReview' | 'sent';

type ItemSource = 'GitHub' | 'Linear' | 'tikk';

interface ReadyOptions {
  kind: 'ready';
  identifier: string;
  source: ItemSource;
  repository?: string;
  title: string;
  state: { kind: ItemStateKind; label: string; age: string | null } | null;
}

type ItemHeaderOptions = ReadyOptions | { kind: 'loading'; identifier: string; source: ItemSource };

const palette = {
  blocked: '#0b0b1b',
  border: '#1c1c2c',
  dim: '#2d2d3d',
  done: '#3e3e4e',
  foreground: '#4f4f5f',
  idle: '#5a5a6a',
  muted: '#6b6b7b',
  working: '#7c7c8c',
} as const;

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => palette }));

const modulePath = './itemHeader.ts';

const { itemHeader } = (await import(modulePath)) as {
  itemHeader: (options: ItemHeaderOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const readyOptions: ReadyOptions = {
  kind: 'ready',
  identifier: '#41',
  source: 'GitHub',
  repository: 'koja',
  title: 'Design the sidebar',
  state: { kind: 'openPullRequest', label: 'open', age: '1m ago' },
};

describe('itemHeader', () => {
  test('a loading item header draws the identifier and its source only', () => {
    const header = itemHeader({ kind: 'loading', identifier: 'ME-1094', source: 'Linear' });

    expect(drawnTexts(header)).toEqual(['ME-1094 · Linear']);
    expect(drawnIcons(header)).toEqual([]);
  });

  test('a ready item header draws its link, title, state, and one age in that order', () => {
    expect(drawnTexts(itemHeader(readyOptions))).toEqual([
      'koja #41 · GitHub',
      'Design the sidebar',
      'open',
      'synced 1m ago',
    ]);
  });

  test('the title draws in the heading role and wraps instead of cutting', () => {
    const title = elementWithText(itemHeader(readyOptions), 'Design the sidebar');

    expect(title?.styles['text_size']).toEqual([textSize.large]);
    expect(title?.styles['font_semibold']).toBeDefined();
    expect(title?.styles['truncate']).toBeUndefined();
    expect(title?.styles['min_w']).toEqual([0]);
  });

  test('the age draws once, in the dim ink', () => {
    const header = itemHeader(readyOptions);

    expect(elementWithText(header, 'synced 1m ago')?.textColors).toEqual([palette.dim]);
  });

  test.each([
    ['openPullRequest', 'git-pull-request.svg'],
    ['inProgress', 'loader-circle.svg'],
    ['inReview', 'message-circle-question.svg'],
    ['sent', 'check.svg'],
  ] as const)('the %s state draws its own mark', (kind, mark) => {
    const header = itemHeader({
      ...readyOptions,
      state: { kind, label: 'state', age: null },
    });

    expect(drawnIcons(header)).toContain(mark);
  });

  test('a working state draws a spinning mark', () => {
    const header = itemHeader({
      ...readyOptions,
      state: { kind: 'inProgress', label: 'In progress', age: null },
    });

    expect(spinning(header)).toBe(true);
  });

  test('a state without an age draws no age', () => {
    const header = itemHeader({
      ...readyOptions,
      state: { kind: 'openPullRequest', label: 'open', age: null },
    });

    expect(drawnTexts(header)).toEqual(['koja #41 · GitHub', 'Design the sidebar', 'open']);
  });

  test('an item without a state draws no chip and no age', () => {
    const header = itemHeader({ ...readyOptions, state: null });

    expect(drawnTexts(header)).toEqual(['koja #41 · GitHub', 'Design the sidebar']);
    expect(drawnIcons(header)).toEqual([]);
  });
});
