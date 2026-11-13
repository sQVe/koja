import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import {
  drawn,
  drawnIcons,
  drawnTexts,
  elementsWithBorder,
  elementsWithStyle,
} from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake, kitIndexFake } from '../../../tests/moduleFakes.ts';
import type { Project } from './projects.ts';
import type { Pull } from './pulls.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import { placeOf, repoOf } from './tree.ts';

interface RowStateLike {
  drag: { source: string | null; over: string | null };
  cursor: string | null;
  lookup: (git: GitInfo | null) => Pull | null;
  attachDrag: (element: unknown, space: SpaceInfo, ids: readonly string[]) => void;
}

interface HeaderStateLike extends RowStateLike {
  hovered: string | null;
  onHover: (spaceId: string, hovered: boolean, cx: unknown) => void;
  toggleFold: (key: string, cx: unknown) => void;
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

const kitParts = [
  'icon',
  'listRow',
  'projectHeader',
  'size',
  'statusMark',
  'text',
  'textRole',
  'theme',
];

const kitExports = Object.assign({}, ...(await Promise.all(kitParts.map(kitModule)))) as Record<
  string,
  unknown
>;

const sharedNames = new Set(Object.keys(kitIndexFake()));

const realKit = Object.fromEntries(
  Object.entries(kitExports).filter(([name]) => sharedNames.has(name)),
);

await mock.module('../../kit/index.ts', () => kitIndexFake(realKit));

const modulePath = './spaceRows.ts';

const loaded = (await import(modulePath)) as {
  row: (row: ListedSpace, ids: readonly string[], state: RowStateLike) => DrawnElement;
  headerRow: (
    project: Project,
    main: ListedSpace,
    ids: readonly string[],
    state: HeaderStateLike,
  ) => DrawnElement;
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

const mainSpace: ListedSpace = {
  ...listedSpace(true),
  space: { ...listedSpace(true).space, id: 'main', name: 'koja' },
  git: { ...git, branch: 'main', linked: false },
  status: 'blocked',
};

const projectWith = (spaces: ListedSpace[]): Project => ({
  key: git.repo.key,
  name: 'koja',
  machine: null,
  git: mainSpace.git,
  main: mainSpace,
  spaces,
  folded: false,
  hidden: 0,
});

const headerState = (hovers: string[]): HeaderStateLike => ({
  ...stateWith(pull),
  hovered: null,
  onHover: (spaceId, hovered) => {
    hovers.push(`${spaceId} ${String(hovered)}`);
  },
  toggleFold: () => undefined,
});

describe('headerRow', () => {
  test('shows the agent mark of the main space and the project name, without PR or branch', () => {
    const header = loaded.headerRow(projectWith([]), mainSpace, ['main'], headerState([]));

    expect(drawnIcons(header)).toContain('message-circle-question.svg');
    expect(drawnTexts(header).filter((text) => text !== '')).toEqual(['koja']);
  });

  test('reports hover on the main space when the project has other spaces to fold', () => {
    const hovers: string[] = [];

    const header = loaded.headerRow(
      projectWith([listedSpace(true)]),
      mainSpace,
      ['main', 'a'],
      headerState(hovers),
    );

    header.hoverHandlers[0]?.(true, {});

    expect(hovers).toEqual(['main true']);
  });

  test('reports no hover when the project has nothing to fold', () => {
    const header = loaded.headerRow(projectWith([]), mainSpace, ['main'], headerState([]));

    expect(header.hoverHandlers).toEqual([]);
  });

  const headerOf = (main: ListedSpace, state: Partial<HeaderStateLike>): DrawnElement =>
    loaded.headerRow(projectWith([listedSpace(true)]), main, ['main', 'a'], {
      ...headerState([]),
      ...state,
    });

  const activeMain: ListedSpace = { ...mainSpace, space: { ...mainSpace.space, active: true } };

  test('fills the header of the active main space with the selected pill', () => {
    expect(headerOf(activeMain, {}).backgroundColors).toContain(themeColors.selected);
    expect(headerOf(mainSpace, {}).backgroundColors).not.toContain(themeColors.selected);
  });

  test('names the machine of a remote project in its header', () => {
    const remote = { ...projectWith([]), machine: 'build-box' };
    const header = loaded.headerRow(remote, mainSpace, ['main'], headerState([]));

    expect(drawnTexts(header)).toContain('build-box');
    expect(drawnIcons(header)).toContain('server.svg');
  });

  test('outlines the header only when the list cursor is on the main space', () => {
    expect(
      elementsWithBorder(headerOf(mainSpace, { cursor: 'main' }), themeColors.accent),
    ).toHaveLength(1);

    expect(
      elementsWithBorder(headerOf(mainSpace, { cursor: 'a' }), themeColors.accent),
    ).toHaveLength(0);
  });

  test('shows the fold chevron only while the main space is the hovered one', () => {
    expect(drawnIcons(headerOf(mainSpace, { hovered: 'main' }))).toContain('chevron-down.svg');
    expect(drawnIcons(headerOf(mainSpace, { hovered: 'a' }))).not.toContain('chevron-down.svg');
  });

  test('dims the header while its main space is dragged over another row', () => {
    const dragged = headerOf(mainSpace, { drag: { source: 'main', over: 'a' } });
    const still = headerOf(mainSpace, {});

    expect(dragged.styles['opacity']).toBeDefined();
    expect(still.styles['opacity']).toBeUndefined();
  });

  test('draws a drop line on top of the header while a later row is dragged over it', () => {
    const target = headerOf(mainSpace, { drag: { source: 'a', over: 'main' } });
    const lines = elementsWithStyle(target, 'top');

    expect(lines).toHaveLength(1);
    expect(lines[0]?.backgroundColors).toContain(themeColors.accent);
    expect(elementsWithStyle(headerOf(mainSpace, {}), 'top')).toHaveLength(0);
  });
});
