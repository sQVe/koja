import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import {
  click,
  clickablesWithText,
  drawn,
  drawnIcons,
  drawnTexts,
  drawnTree,
} from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import type { Project } from './projects.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import { placeOf, repoOf } from './tree.ts';

interface ProjectRowsHostLike {
  projects: Project[];
  loading: boolean;
  draw: (row: ListedSpace) => unknown;
  drawMain: (project: Project, main: ListedSpace) => unknown;
  pullFailed: (git: GitInfo) => boolean;
  retryPull: (git: GitInfo, cx: unknown) => void;
  toggleFold: (key: string, cx: unknown) => void;
}

interface SpaceOptions {
  machine?: string | null;
  status?: Status | null;
  active?: boolean;
  main?: boolean;
}

const themeColors = {
  foreground: '#111111',
  muted: '#222222',
  selected: '#333333',
  border: '#444444',
  hover: '#555555',
  dim: '#666666',
  blocked: '#777777',
};

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () => herdrFake({ theme: () => themeColors }));

const kitParts = [
  'button',
  'icon',
  'listRow',
  'projectHeader',
  'size',
  'stateLine',
  'statusMark',
  'text',
  'textRole',
  'theme',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

const modulePath = './projectRows.ts';

const loaded = (await import(modulePath)) as {
  projectRows: (host: ProjectRowsHostLike) => DrawnElement[];
};

const { groupProjects } = await import('./projects.ts');

const spaceRowsPath = './spaceRows.ts';

const { headerRow } = (await import(spaceRowsPath)) as {
  headerRow: (
    project: Project,
    main: ListedSpace,
    ids: readonly string[],
    state: unknown,
  ) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const spaceOf = (id: string, options: SpaceOptions): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: true,
  folder: '',
  machine: options.machine ?? null,
  branch: null,
  active: options.active ?? false,
  status: options.status ?? null,
  tabs: [],
});

const gitAt = (name: string, machine: string | null, linked: boolean): GitInfo => ({
  branch: 'main',
  repo: repoOf(machine, `/code/${name}/.git`),
  root: `/code/${name}`,
  cwd: `/code/${name}`,
  linked,
});

const listed = (id: string, project: string, options: SpaceOptions = {}): ListedSpace => {
  const space = spaceOf(id, options);
  const git = gitAt(project, space.machine, options.main !== true);

  return { space, git, status: options.status ?? null, place: placeOf(space.machine, git.root) };
};

const projectsOf = (list: ListedSpace[], folded: string[] = []): Project[] =>
  groupProjects(list, { has: (key) => folded.includes(key) });

const drawMain = (_project: Project, main: ListedSpace): DrawnElement => {
  const element = drawn();

  element.texts.push(`main-${main.space.id}`);

  return element;
};

const drawRow = (row: ListedSpace): DrawnElement => {
  const element = drawn();

  element.texts.push(`space-${row.space.id}`);

  return element;
};

const hostOf = (overrides: Partial<ProjectRowsHostLike>): ProjectRowsHostLike => ({
  projects: [],
  loading: false,
  draw: drawRow,
  drawMain,
  pullFailed: () => false,
  retryPull: () => undefined,
  toggleFold: () => undefined,
  ...overrides,
});

const drawnOf = (overrides: Partial<ProjectRowsHostLike>): DrawnElement =>
  drawnTree(loaded.projectRows(hostOf(overrides)));

const pullError = 'Could not read PRs';

describe('projectRows', () => {
  test('a project with only its main space draws its header and no space row', () => {
    const tree = drawnOf({ projects: projectsOf([listed('a', 'koja', { main: true })]) });

    expect(drawnTexts(tree).filter((text) => text !== '')).toEqual(['main-a']);
  });

  test('a project with its main space and two others draws the header and two rows', () => {
    const list = [listed('b', 'koja'), listed('a', 'koja', { main: true }), listed('c', 'koja')];

    const tree = drawnOf({ projects: projectsOf(list) });

    expect(drawnTexts(tree).filter((text) => text !== '')).toEqual([
      'main-a',
      'space-b',
      'space-c',
    ]);
  });

  test('names the machine in a remote project header and draws no machine header', () => {
    const tree = drawnOf({
      projects: projectsOf([listed('a', 'koja'), listed('r', 'herdr', { machine: 'build-box' })]),
    });

    const texts = drawnTexts(tree);

    expect(texts.filter((text) => text === 'build-box')).toHaveLength(1);
    const header = clickablesWithText(tree, 'herdr')[0] as DrawnElement;

    expect(drawnTexts(header)).toContain('build-box');
    expect(drawnIcons(header)).toContain('server.svg');
    expect(texts).not.toContain('This computer');
    expect(drawnIcons(tree)).not.toContain('monitor.svg');
  });

  test('names the machine in the header of a remote project that has a main space', () => {
    const list = [
      listed('a', 'koja', { main: true }),
      listed('r', 'herdr', { machine: 'build-box', main: true }),
    ];

    const state = {
      drag: { source: null, over: null },
      cursor: null,
      age: null,
      hovered: null,
      lookup: () => null,
      attachDrag: () => undefined,
      onHover: () => undefined,
      toggleFold: () => undefined,
    };

    const rows = loaded.projectRows(
      hostOf({
        projects: projectsOf(list),
        drawMain: (project, main) => headerRow(project, main, ['a', 'r'], state),
      }),
    );

    const remote = rows.find((row) => drawnTexts(row).includes('herdr')) as DrawnElement;
    const local = rows.find((row) => drawnTexts(row).includes('koja')) as DrawnElement;

    expect(drawnTexts(remote)).toContain('build-box');
    expect(drawnIcons(remote)).toContain('server.svg');
    expect(drawnTexts(local)).not.toContain('build-box');
    expect(drawnTexts(drawnTree(rows)).filter((text) => text === 'build-box')).toHaveLength(1);
  });

  test('draws each project header before its spaces, in project order', () => {
    const tree = drawnOf({
      projects: projectsOf([listed('a', 'koja'), listed('t', 'tikk'), listed('b', 'koja')]),
    });

    const texts = drawnTexts(tree).filter((text) => text !== '');

    expect(texts).toEqual(['koja', 'space-a', 'space-b', 'tikk', 'space-t']);
  });

  test('keeps every space row a direct child of the list', () => {
    const rows = loaded.projectRows(
      hostOf({ projects: projectsOf([listed('a', 'koja'), listed('t', 'tikk')]) }),
    );

    const direct = rows.flatMap((element) => element.texts);

    expect(direct).toContain('space-a');
    expect(direct).toContain('space-t');
  });

  test('a failed PR read draws its line under the project header, before the rows', () => {
    const projects = projectsOf([listed('a', 'koja'), listed('t', 'tikk')]);

    const tree = drawnOf({
      projects,
      pullFailed: (git) => git.repo.key === projects[0]?.git?.repo.key,
    });

    const texts = drawnTexts(tree).filter((text) => text !== '');

    expect(texts.slice(0, 4)).toEqual(['koja', pullError, 'Retry', 'space-a']);
    expect(texts.filter((text) => text === pullError)).toHaveLength(1);
  });

  test('Retry calls the PR retry once with the project git', () => {
    const projects = projectsOf([listed('a', 'koja')]);
    const retried: unknown[] = [];

    const tree = drawnOf({
      projects,
      pullFailed: () => true,
      retryPull: (git) => {
        retried.push(git);
      },
    });

    click(clickablesWithText(tree, 'Retry')[0] as DrawnElement);

    expect(retried).toEqual([projects[0]?.git]);
  });

  test('a folded project draws its count and only its spaces that need the user or are active', () => {
    const list = [
      listed('a', 'koja'),
      listed('b', 'koja', { status: 'blocked' }),
      listed('c', 'koja', { active: true }),
      listed('d', 'koja', { status: 'working' }),
    ];

    const key = projectsOf(list)[0]?.key ?? '';
    const texts = drawnTexts(drawnOf({ projects: projectsOf(list, [key]) }));

    expect(texts).toContain('2 more');
    expect(texts.filter((text) => text.startsWith('space-'))).toEqual(['space-b', 'space-c']);
  });

  test('a click on the header of a project without a main space toggles its fold', () => {
    const projects = projectsOf([listed('a', 'koja'), listed('t', 'tikk')]);
    const toggled: unknown[] = [];

    const tree = drawnOf({
      projects,
      toggleFold: (key) => {
        toggled.push(key);
      },
    });

    click(clickablesWithText(tree, 'tikk')[0] as DrawnElement);

    expect(toggled).toEqual([projects[1]?.key]);
  });

  test('draws Loading while no project shows and a space still waits', () => {
    expect(drawnTexts(drawnOf({ loading: true }))).toContain('Loading…');
  });

  test('draws nothing with no project and no waiting space', () => {
    expect(loaded.projectRows(hostOf({}))).toEqual([]);
  });
});
