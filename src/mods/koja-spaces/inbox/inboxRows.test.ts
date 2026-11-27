import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import { descendants, drawn, drawnTexts, drawnTree } from '../../../../tests/drawn.ts';
import type { DrawnElement } from '../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  realKitIndexFake,
} from '../../../../tests/moduleFakes.ts';
import { placeOf } from '../../../data/gitIdentity.ts';
import type { StackNeed } from '../../../data/pullNeeds.ts';
import { overlaySize } from '../../../kit/size.ts';
import type { InboxGroup } from '../inbox.ts';
import { inboxGroups } from '../inbox.ts';
import type { ShownRow } from '../projects.ts';
import type { ListedSpace } from '../tree.ts';

interface InboxRowsHostLike {
  groups: InboxGroup[];
  loading: boolean;
  draw: (row: ListedSpace, project: string) => unknown;
}

const themeColors = {
  foreground: '#111111',
  muted: '#222222',
  dim: '#666666',
};

const overlays: unknown[] = [];

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () =>
  gpuiBaseFake({ h_flex: () => drawn(), v_flex: () => drawn() }),
);

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({
    openOverlay: (options: unknown) => {
      overlays.push(options);

      return null;
    },
    theme: () => themeColors,
  }),
);

const kitParts = ['sectionHeader', 'size', 'stateLine', 'text', 'textRole', 'theme'];

const kitFake = await realKitIndexFake(kitParts);

await mock.module('../../../kit/index.ts', () => kitFake);

const modulePath = './inboxRows.ts';

const loaded = (await import(modulePath)) as {
  inboxRows: (host: InboxRowsHostLike) => DrawnElement[];
};

afterAll(() => {
  mock.restore();
});

const listed = (id: string, status: Status | null): ShownRow => {
  const space: SpaceInfo = {
    id,
    index: 1,
    name: id,
    named: false,
    folder: `/code/${id}`,
    machine: null,
    branch: null,
    active: false,
    status,
    tabs: [],
  };

  return {
    row: { space, git: null, status, place: placeOf(space.machine, space.folder) },
    project: 'koja',
  };
};

const needOf = (row: ListedSpace): StackNeed | null =>
  row.space.id.startsWith('pull') ? 'failing' : null;

const groupsOf = (rows: ShownRow[]): InboxGroup[] => inboxGroups(rows, needOf);

const drawRow = (row: ListedSpace, project: string): DrawnElement => {
  const element = drawn();

  element.texts.push(`space-${row.space.id}`, project);

  return element;
};

const hostOf = (overrides: Partial<InboxRowsHostLike>): InboxRowsHostLike => ({
  groups: [],
  loading: false,
  draw: drawRow,
  ...overrides,
});

const rowsOf = (overrides: Partial<InboxRowsHostLike>): DrawnElement[] =>
  loaded.inboxRows(hostOf(overrides));

describe('inboxRows', () => {
  test('draws the loading row while no group shows and the mod is loading', () => {
    expect(drawnTexts(drawnTree(rowsOf({ loading: true })))).toContain('Loading…');
  });

  test('draws nothing while no group shows and nothing waits', () => {
    expect(rowsOf({ loading: false })).toEqual([]);
  });

  test('puts a gap between groups and none before the first', () => {
    const groups = groupsOf([listed('ask', 'blocked'), listed('quiet', 'done')]);
    const rows = rowsOf({ groups });

    expect(drawnTexts(rows[0] as DrawnElement)).toContain('Agent asks');
    expect(drawnTexts(rows[1] as DrawnElement)).toContain('space-ask');
    expect(drawnTexts(rows[2] as DrawnElement)).toEqual([]);
    expect(drawnTexts(rows[3] as DrawnElement)).toContain('Quiet');
    expect(drawnTexts(rows[4] as DrawnElement)).toContain('space-quiet');
  });

  test('draws the PR needs you group for a row with a pull need', () => {
    const groups = groupsOf([listed('pull-one', 'idle')]);
    const rows = rowsOf({ groups });

    expect(drawnTexts(rows[0] as DrawnElement)).toContain('PR needs you');
    expect(drawnTexts(rows[0] as DrawnElement)).toContain('1');
    expect(drawnTexts(rows[1] as DrawnElement)).toContain('space-pull-one');
  });

  test('draws the group count in the dim detail color', () => {
    const groups = groupsOf([listed('first', 'done'), listed('second', 'done')]);
    const header = rowsOf({ groups })[0] as DrawnElement;

    const count = descendants(header).find((part) => part.texts.includes('2'));

    expect(count?.textColors).toEqual([themeColors.dim]);
  });

  test('a right click on a row opens its space menu', () => {
    overlays.length = 0;

    const groups = groupsOf([listed('ask', 'blocked')]);

    const row = rowsOf({ groups }).find((element) =>
      drawnTexts(element).includes('space-ask'),
    ) as DrawnElement;

    row.mouseHandlers['on_mouse_down:right']?.[0]?.({}, {});

    expect(overlays).toEqual([
      {
        mod: 'koja-menu',
        kind: 'popup',
        width: overlaySize.menuWidth,
        height: overlaySize.menuHeight,
        props: { tab: 'space', target: { id: 'ask' } },
      },
    ]);
  });
});
