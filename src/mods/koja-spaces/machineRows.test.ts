import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import {
  click,
  drawn,
  drawnIcons,
  drawnTexts,
  drawnTooltips,
  drawnTree,
  elementWithText,
  elementWithTooltip,
} from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../../tests/moduleFakes.ts';
import type { GitInfo, ListedSpace, TreeGroup, TreeRow } from './tree.ts';
import { repoOf } from './tree.ts';

interface MachineLike {
  name: string;
  state: string | null;
}

interface MachineRowsHostLike {
  machineList: MachineLike[];
  groups: TreeGroup[];
  draw: (row: TreeRow, lineAbove: boolean) => unknown;
  folded: (machine: string | null) => boolean;
  loading: (machine: string | null) => boolean;
  addSpace: (machine: string | null) => void;
  toggleFold: (machine: string | null) => void;
  machineError: () => string | null;
  pullError: (git: GitInfo | null) => string | null;
  retryMachines: (cx: unknown) => void;
  retryPull: (git: GitInfo | null, cx: unknown) => void;
}

interface RepoFixture {
  group: TreeGroup;
  git: GitInfo;
}

interface HostOptions {
  machineList?: MachineLike[];
  groups?: TreeGroup[];
  machineError?: string | null;
  pullError?: (git: GitInfo | null) => string | null;
  retryMachines?: (cx: unknown) => void;
  retryPull?: (git: GitInfo | null, cx: unknown) => void;
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

const modulePath = './machineRows.ts';

const loaded = (await import(modulePath)) as {
  machineRows: (host: MachineRowsHostLike, collapsed: boolean) => DrawnElement[];
};

const space = (id: string, machine: string | null = null): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: false,
  folder: '',
  machine,
  branch: null,
  active: false,
  status: null,
  tabs: [],
});

const gitInfo = (path: string): GitInfo => ({
  branch: 'main',
  repo: repoOf(null, path),
  root: `/code/${path}`,
  cwd: `/code/${path}`,
  linked: false,
  committedAt: null,
});

const repoFixture = (
  id: string,
  childId: string | null = null,
  machine: string | null = null,
): RepoFixture => {
  const git = gitInfo('/repo/.git');
  const main: ListedSpace = { space: space(id, machine), git, status: null };

  const children =
    childId === null
      ? []
      : [{ kind: 'space' as const, space: space(childId, machine), git, status: null }];

  const group: TreeGroup = {
    kind: 'repo',
    repo: git.repo,
    name: 'repo',
    main,
    fold: null,
    children,
  };

  return { group, git };
};

const drawRow = (row: TreeRow): DrawnElement => {
  const element = drawn();

  element.texts.push(row.kind === 'repo' ? 'repo-row' : `space-${row.space.id}`);

  return element;
};

const hostOf = (options: HostOptions): MachineRowsHostLike => ({
  machineList: options.machineList ?? [],
  groups: options.groups ?? [],
  draw: (row) => drawRow(row),
  folded: () => false,
  loading: () => false,
  addSpace: () => undefined,
  toggleFold: () => undefined,
  machineError: () => options.machineError ?? null,
  pullError: options.pullError ?? (() => null),
  retryMachines: options.retryMachines ?? (() => undefined),
  retryPull: options.retryPull ?? (() => undefined),
});

afterAll(() => {
  mock.restore();
});

const machinesError = 'Could not read machines.';

describe('machineRows', () => {
  test('no error draws no machine error text', () => {
    const rows = loaded.machineRows(hostOf({ groups: [repoFixture('a').group] }), false);
    const texts = drawnTexts(drawnTree(rows));

    expect(texts).not.toContain(machinesError);
    expect(texts).not.toContain('Retry');
  });

  test('a machine error is drawn first in the sidebar, with Retry, and carries its text as a tooltip', () => {
    const retry = mock(() => undefined);

    const rows = loaded.machineRows(
      hostOf({
        groups: [repoFixture('a').group],
        machineError: machinesError,
        retryMachines: retry,
      }),
      false,
    );

    const tree = drawnTree(rows);

    expect(drawnTexts(tree)).toEqual([machinesError, 'Retry', 'repo-row']);
    expect(drawnTooltips(tree)).toContain(machinesError);

    const button = elementWithText(tree, 'Retry');

    click(button as DrawnElement);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test('a machine error with a remote machine comes before the first machine header', () => {
    const rows = loaded.machineRows(
      hostOf({ groups: [repoFixture('a', null, 'work').group], machineError: machinesError }),
      false,
    );

    const texts = drawnTexts(drawnTree(rows));
    const errorAt = texts.indexOf(machinesError);
    const headerAt = texts.indexOf('This computer');

    expect(errorAt).toBe(0);
    expect(headerAt).toBeGreaterThan(errorAt);
  });

  test('a machine error in the rail is a mark with the error tooltip whose click calls the machine retry', () => {
    const retry = mock(() => undefined);

    const rows = loaded.machineRows(
      hostOf({ machineError: machinesError, retryMachines: retry }),
      true,
    );

    const tree = drawnTree(rows);

    expect(drawnTexts(tree)).not.toContain(machinesError);
    expect(drawnIcons(tree)).toContain('circle-alert.svg');

    const mark = elementWithTooltip(tree, machinesError);

    click(mark as DrawnElement);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test('a PR error is drawn after the group first row and its Retry calls the PR retry with that git', () => {
    const retry = mock(() => undefined);
    const repo = repoFixture('a', 'child');
    const prError = 'koja PRs are 6m old.';

    const rows = loaded.machineRows(
      hostOf({
        groups: [repo.group],
        pullError: (git) => (git === null ? null : prError),
        retryPull: retry,
      }),
      false,
    );

    const tree = drawnTree(rows);
    const texts = drawnTexts(tree);
    const labelAt = texts.indexOf('repo-row');
    const errorAt = texts.indexOf(prError);
    const childAt = texts.indexOf('space-child');

    expect(errorAt).toBeGreaterThan(labelAt);
    expect(childAt).toBeGreaterThan(errorAt);

    const button = elementWithText(tree, 'Retry');

    click(button as DrawnElement);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith(repo.git, expect.anything());
  });
});
