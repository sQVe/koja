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
const railPath = './rail.ts';
const railDataPath = './railData.ts';
const kojaPath = '../koja.ts';

const { railScene } = (await import(railPath)) as {
  railScene: (state: unknown, tokens: unknown) => DrawnElement;
};

const { railStates } = (await import(railDataPath)) as { railStates: Record<string, unknown> };

const { koja } = (await import(kojaPath)) as { koja: unknown };

afterAll(() => {
  mock.restore();
});

const textsOf = (name: string): string[] => drawnTexts(railScene(railStates[name], koja));

describe('the rail states', () => {
  test.each(Object.keys(railStates))('%s draws no commit bar', (name) => {
    expect(textsOf(name)).not.toContain('Commit');
  });

  test('a long file list folds the rest into one row', () => {
    expect(textsOf('busy')).toContain('40 more files');
  });

  test('only the selected asking worker gets a reply field', () => {
    const texts = textsOf('busy');

    expect(texts.filter((text) => text === 'Reply to the worker')).toHaveLength(1);
    expect(texts).toContain('Should the judge score the normal mode crops too?');
  });

  test('a clean space shows the branch view and hides the workers group', () => {
    const texts = textsOf('clean');

    expect(texts).toContain('Uncommitted 0');
    expect(texts).toContain('src/mods/koja-spaces/row.ts');
    expect(texts).not.toContain('Workers');
  });

  test('a branch without a PR says so and counts its commits', () => {
    const texts = textsOf('noPull');

    expect(texts).toContain('No PR yet');
    expect(texts).toContain('2 commits');
  });

  test('a space on main has no branch view and no PR rows', () => {
    const texts = textsOf('main');

    expect(texts).toContain('README.md');
    expect(texts).not.toContain('Branch 0');
    expect(texts).not.toContain('#44');
  });

  test('a failed read says so and offers Retry while rows keep their facts', () => {
    const texts = textsOf('error');

    expect(texts).toContain('Could not read PRs · 4m ago');
    expect(texts).toContain('Retry');
    expect(texts).toContain('2 checks running');
  });
});
