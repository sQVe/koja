import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';

interface RepoLabelOptions {
  name: string;
  branch?: string;
  age?: string;
  folded: boolean;
  selected: boolean;
}

const themeColors = {
  foreground: '#111111',
  muted: '#222222',
  dim: '#333333',
};

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));

await mock.module('herdr', () => herdrFake({ theme: () => themeColors }));

// A path in a variable keeps the typechecker of tests away from the gpui modules.
const modulePath = './repoLabel.ts';

const loaded = (await import(modulePath)) as {
  repoLabel: (options: RepoLabelOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

describe('repoLabel', () => {
  test('draws the separator only when both branch and age exist', () => {
    const label = loaded.repoLabel({
      name: 'koja',
      branch: 'main',
      age: '2m',
      folded: false,
      selected: false,
    });

    expect(drawnTexts(label)).toContain(' · ');
  });

  test('draws no separator with the branch only', () => {
    const label = loaded.repoLabel({
      name: 'koja',
      branch: 'main',
      folded: false,
      selected: false,
    });

    expect(drawnTexts(label)).not.toContain(' · ');
  });

  test('draws no separator with the age only', () => {
    const label = loaded.repoLabel({ name: 'koja', age: '2m', folded: false, selected: false });

    expect(drawnTexts(label)).not.toContain(' · ');
  });

  test('draws no separator with neither branch nor age', () => {
    const label = loaded.repoLabel({ name: 'koja', folded: false, selected: false });

    expect(drawnTexts(label)).not.toContain(' · ');
  });
});
