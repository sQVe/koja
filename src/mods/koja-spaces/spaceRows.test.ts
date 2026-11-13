import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { drawn, drawnTexts } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import type { Pull } from './pulls.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import { placeOf, repoOf } from './tree.ts';

interface RowStateLike {
  drag: { source: string | null; over: string | null };
  cursor: string | null;
  lookup: (git: GitInfo | null) => Pull | null;
  attachDrag: (element: unknown, space: SpaceInfo, ids: readonly string[]) => void;
}

const themeColors = {
  accent: '#000000',
  foreground: '#111111',
  muted: '#222222',
  selected: '#333333',
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

const kitModule = async (name: string): Promise<Record<string, unknown>> =>
  (await import(`../../kit/${name}.ts`)) as Record<string, unknown>;

const kitParts = ['icon', 'listRow', 'size', 'statusMark', 'text', 'textRole', 'theme'];

const kitExports = Object.assign({}, ...(await Promise.all(kitParts.map(kitModule)))) as Record<
  string,
  unknown
>;

const sharedNames = new Set(Object.keys(kitIndexFake()));

const realKit = Object.fromEntries(
  Object.entries(kitExports).filter(([name]) => sharedNames.has(name)),
);

// Other test files mock the kit index with stand-ins, so this file mocks it with the real parts.
await mock.module('../../kit/index.ts', () => kitIndexFake(realKit));

const modulePath = './spaceRows.ts';

const loaded = (await import(modulePath)) as {
  row: (row: ListedSpace, ids: readonly string[], state: RowStateLike) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const git: GitInfo = {
  branch: 'feature-login',
  repo: repoOf(null, '/code/koja/.git'),
  root: '/code/koja',
  cwd: '/code/koja',
  linked: true,
  committedAt: null,
};

const pull: Pull = {
  number: 42,
  state: 'OPEN',
  isDraft: false,
  title: 'Add the login form',
  headRefName: 'feature-login',
};

const listedSpace = (named: boolean): ListedSpace => ({
  space: {
    id: 'a',
    index: 1,
    name: 'login',
    named,
    folder: '/code/koja',
    machine: null,
    branch: 'feature-login',
    active: false,
    status: null,
    tabs: [],
  },
  git,
  status: 'working',
  place: placeOf(null, '/code/koja'),
});

const stateWith = (found: Pull | null): RowStateLike => ({
  drag: { source: null, over: null },
  cursor: null,
  lookup: () => found,
  attachDrag: () => undefined,
});

const textsOf = (named: boolean, found: Pull | null): string[] =>
  drawnTexts(loaded.row(listedSpace(named), ['a'], stateWith(found)));

describe('row', () => {
  test('draws the space title and no PR number and no branch', () => {
    const texts = textsOf(true, pull);

    expect(texts).toContain('login');
    expect(texts.some((text) => text.includes('#'))).toBe(false);
    expect(texts.some((text) => text.includes('feature-login'))).toBe(false);
  });

  test('titles an unnamed space with its PR title', () => {
    expect(textsOf(false, pull)).toContain('Add the login form');
  });

  test('titles an unnamed space without a PR with its name', () => {
    expect(textsOf(false, null)).toContain('login');
  });
});
