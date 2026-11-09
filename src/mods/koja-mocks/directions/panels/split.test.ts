import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({ icon: (name: string) => drawn(name) }),
);

// Loaded by path, so the root typecheck does not follow them into source that needs Herdr's types.
const splitPath = './split.ts';
const railDataPath = './railData.ts';
const kojaPath = '../koja.ts';

const { splitScene } = (await import(splitPath)) as {
  splitScene: (variant: string, state: unknown, tokens: unknown) => DrawnElement;
};

const { railStates } = (await import(railDataPath)) as { railStates: Record<string, unknown> };

const { koja } = (await import(kojaPath)) as { koja: unknown };

afterAll(() => {
  mock.restore();
});

const textsOf = (variant: string, state: string): string[] =>
  drawnTexts(splitScene(variant, railStates[state], koja));

const count = (texts: string[], text: string): number =>
  texts.filter((candidate) => candidate === text).length;

const scenes = ['two', 'three'].flatMap((variant) =>
  ['base', 'busy', 'main'].map((state) => ({ variant, state })),
);

describe('the split panels', () => {
  test.each(scenes)('$variant $state is named Status and has no commit bar', (scene) => {
    const texts = textsOf(scene.variant, scene.state);

    expect(texts).toContain('Status');
    expect(texts).not.toContain('Commit');
  });

  test.each(scenes)('$variant $state offers one reply when a worker asks', (scene) => {
    const texts = textsOf(scene.variant, scene.state);
    const replies = scene.state === 'main' ? 0 : 1;

    expect(count(texts, 'Reply to the worker')).toBe(replies);
  });

  test('the two-section busy panel folds the rest of a long file list', () => {
    expect(textsOf('two', 'busy')).toContain('40 more files');
  });

  test('the three-section panel names the checked-out branch and offers Files beside Changes', () => {
    const texts = textsOf('three', 'base');

    expect(texts).toContain('me-1090-design-the-sidebar');
    expect(texts).toContain('Files');
  });

  test('the three-section panel on main shows one stack line and no branch switch', () => {
    const texts = textsOf('three', 'main');

    expect(texts).toContain('On main');
    expect(texts.some((text) => text.startsWith('Branch'))).toBe(false);
  });
});
