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
const spacePath = './space.ts';
const railDataPath = './railData.ts';
const kojaPath = '../koja.ts';

const { spaceScene } = (await import(spacePath)) as {
  spaceScene: (view: string, state: unknown, tokens: unknown) => DrawnElement;
};

const { railStates } = (await import(railDataPath)) as { railStates: Record<string, unknown> };

const { koja } = (await import(kojaPath)) as { koja: unknown };

afterAll(() => {
  mock.restore();
});

const textsOf = (view: string, state: string): string[] =>
  drawnTexts(spaceScene(view, railStates[state], koja));

describe('the space panel', () => {
  test.each(Object.keys(railStates))('%s is named Space and has no commit bar', (state) => {
    const texts = textsOf('stack', state);

    expect(texts).toContain('Space');
    expect(texts).not.toContain('Commit');
  });

  test('the busy space keeps every worker row and one reply field', () => {
    const texts = textsOf('stack', 'busy');

    expect(texts).toContain('Restack onto main');
    expect(texts.filter((text) => text === 'Reply to the worker')).toHaveLength(1);
  });

  test('a clean space hides the workers section', () => {
    expect(textsOf('stack', 'clean')).not.toContain('Workers');
  });

  test('the files view swaps the stack for the tree and keeps the workers', () => {
    const texts = textsOf('files', 'base');

    expect(texts).toContain('package.json');
    expect(texts).not.toContain('Find a space by PR');
    expect(texts).toContain('Port the shell scene');
  });
});
