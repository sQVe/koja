import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import {
  drawn,
  drawnIcons,
  drawnTexts,
  elementsWithBorder,
  elementsWithStyle,
} from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../tests/moduleFakes.ts';
import { placeOf, repositoryOf } from '../../data/gitIdentity.ts';
import type { Project } from './projects.ts';
import type { Pull } from './pulls.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import type { WaitTimes } from './waitTimes.ts';
import { advanceWaitTimes, emptyWaitTimes, readWaitTimes, waitAge } from './waitTimes.ts';

interface RowStateLike {
  drag: { source: string | null; over: string | null };
  refused: string | null;
  cursor: string | null;
  age: string | null;
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

const kitParts = [
  'age',
  'icon',
  'listRow',
  'projectHeader',
  'size',
  'statusMark',
  'text',
  'textRole',
  'theme',
];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../kit/index.ts', () => kitFake);

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
  repo: repositoryOf(null, '/code/koja/.git'),
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

const stateWith = (found: Pull | null, age: string | null = null): RowStateLike => ({
  drag: { source: null, over: null },
  refused: null,
  cursor: null,
  age,
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

  test('ends with the age of the main space when it has one, and none without', () => {
    const aged = loaded.headerRow(projectWith([]), mainSpace, ['main'], {
      ...headerState([]),
      age: '4m',
    });

    const plain = loaded.headerRow(projectWith([]), mainSpace, ['main'], headerState([]));

    expect(drawnTexts(aged).filter((text) => text !== '')).toEqual(['koja', '4m']);
    expect(drawnTexts(plain).filter((text) => text !== '')).toEqual(['koja']);
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

const minute = 60_000;

const start = 1_700_000_000_000;

const spaceWith = (id: string, status: Status | null, active: boolean): ListedSpace => {
  const listed = listedSpace(true);

  return { ...listed, space: { ...listed.space, id, active }, status };
};

const drawnRow = (times: WaitTimes, listed: ListedSpace, now: number): string[] => {
  const age = waitAge(
    times,
    { id: listed.space.id, status: listed.status, active: listed.space.active },
    now,
  );

  return drawnTexts(loaded.row(listed, [listed.space.id], stateWith(null, age)));
};

const advanced = (
  times: WaitTimes,
  statuses: Record<string, Status | null>,
  active: string | null,
  now: number,
): WaitTimes => advanceWaitTimes(times, { statuses, active, now }).times;

describe('row age', () => {
  test('a blocked space shows the age since it became blocked', () => {
    const times = advanced(emptyWaitTimes, { a: 'blocked' }, null, start);

    expect(drawnRow(times, spaceWith('a', 'blocked', false), start + 5 * minute)).toEqual([
      'login',
      '5m',
    ]);
  });

  test('a space whose agent works again shows no age', () => {
    const blocked = advanced(emptyWaitTimes, { a: 'blocked' }, null, start);
    const working = advanced(blocked, { a: 'working' }, null, start + minute);

    expect(drawnRow(working, spaceWith('a', 'working', false), start + 5 * minute)).toEqual([
      'login',
    ]);
  });

  test('an idle space shows no age after the user showed it', () => {
    const shown = advanced(emptyWaitTimes, { a: 'idle', b: null }, 'a', start);
    const left = advanced(shown, { a: 'idle', b: null }, 'b', start + minute);

    expect(drawnRow(left, spaceWith('a', 'idle', false), start + 8 * minute)).toEqual(['login']);
  });

  test('the shown space shows no age', () => {
    const shown = advanced(emptyWaitTimes, { a: 'blocked', b: null }, 'a', start);

    expect(drawnRow(shown, spaceWith('a', 'blocked', true), start + 8 * minute)).toEqual(['login']);
  });

  test('blocked and done ages are still drawn from the saved times', () => {
    const first = advanced(emptyWaitTimes, { a: 'blocked', b: 'working' }, null, start);
    const finished = advanced(first, { a: 'blocked', b: 'done' }, null, start + 2 * minute);
    const restored = readWaitTimes(JSON.stringify(finished));
    const later = advanced(restored, { a: 'blocked', b: 'done' }, 'c', start + 7 * minute);

    expect(drawnRow(later, spaceWith('a', 'blocked', false), start + 7 * minute)).toEqual([
      'login',
      '7m',
    ]);

    expect(drawnRow(later, spaceWith('b', 'done', false), start + 7 * minute)).toEqual([
      'login',
      '5m',
    ]);
  });
});
