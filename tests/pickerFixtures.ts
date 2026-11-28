import type { PaneInfo, Program, SpaceInfo, Status, TabInfo } from 'herdr';

import { placeOf, repositoryOf, worktreeOf } from '../src/data/gitIdentity.ts';
import type { Pull } from '../src/data/pulls.ts';
import type { Facts } from '../src/data/snapshot.ts';
import type { StackPull, SpaceStack } from '../src/data/spaceStack.ts';
import type { StackBranch } from '../src/data/stacks.ts';
import { rollupStatuses } from '../src/kit/statusRollup.ts';
import type { PickerData } from '../src/mods/koja-picker/rows.ts';
import { pullFacts } from './pullFacts.ts';

export const shell: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

export const tabOf = (id: string, index: number, active = false): TabInfo => ({
  id,
  index,
  name: String(index),
  named: false,
  active,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

export const spaceOf = (
  id: string,
  index: number,
  name: string,
  tabs: TabInfo[] = [],
): SpaceInfo => ({
  id,
  index,
  name,
  named: true,
  folder: `/home/me/${name}`,
  machine: null,
  branch: null,
  active: false,
  status: null,
  tabs,
});

export const paneOf = (pane: string, tab: string, status: Status | null = null): PaneInfo => ({
  pane,
  terminal: `t-${pane}`,
  tab,
  title: `title ${pane}`,
  name: null,
  cwd: null,
  branch: null,
  status,
  app: null,
  program: shell,
  focused: false,
  zoomed: false,
  movable: true,
});

const defaultSpaces = (): SpaceInfo[] => [
  spaceOf('s1', 1, 'koja', [tabOf('k1', 1, true), tabOf('k2', 2)]),
  spaceOf('s2', 2, 'notes', [tabOf('n1', 1, true)]),
];

const defaultPanes = (): PaneInfo[] => [
  paneOf('p1', 'k1'),
  paneOf('p2', 'k1', 'blocked'),
  paneOf('p3', 'k2'),
  paneOf('p4', 'n1'),
];

export const pickerData = (
  overrides: Partial<PickerData> = {},
  terminalList: unknown[] = [],
): PickerData => {
  const spaces = overrides.spaces ?? defaultSpaces();
  const panes = overrides.panes ?? defaultPanes();

  return {
    spaces,
    panes,
    terminals: terminalList,
    statuses: rollupStatuses(spaces, panes, terminalList),
    stored: null,
    facts: {},
    recent: [],
    focus: {},
    ...overrides,
  };
};

export const stackPullOf = (fields: Partial<StackPull> & Pick<StackPull, 'branch'>): StackPull => ({
  ticket: null,
  number: null,
  url: null,
  title: null,
  state: 'open',
  checkedOut: false,
  restack: 'none',
  need: null,
  ...fields,
});

export const stackOf = (pulls: StackPull[]): SpaceStack => ({
  pulls,
  merged: pulls.filter((pull) => pull.state === 'merged').length,
  total: pulls.length,
});

const mergedStackBranches = [
  'add-search',
  'add-search-ui',
  'add-search-tests',
  'fix-crash',
  'fix-crash-tests',
  'layer-one',
  'layer-two',
  'layer-three',
];

const mergedStackNumbers = [501, 504, 505, 506, 507, 508, 509, 510];

const mergedStackPull = (number: number, index: number): StackPull => {
  const branch = mergedStackBranches[index] ?? `branch-${index}`;
  const state = number === 504 ? 'merged' : 'open';

  return stackPullOf({ branch, number, state });
};

export const mergedStack = (): SpaceStack => stackOf(mergedStackNumbers.map(mergedStackPull));

export const ticketStack = (): SpaceStack =>
  stackOf([
    stackPullOf({ branch: 'me-1181-bottom', ticket: 'ME-1181', number: 601 }),
    stackPullOf({ branch: 'me-1182-middle', ticket: 'ME-1182', number: 602 }),
    stackPullOf({ branch: 'me-1183-top', ticket: 'ME-1183', number: 603 }),
  ]);

const pullStates: Record<
  Exclude<StackPull['state'], 'unknown'>,
  Pick<Pull, 'state' | 'isDraft'>
> = {
  draft: { state: 'OPEN', isDraft: true },
  open: { state: 'OPEN', isDraft: false },
  merged: { state: 'MERGED', isDraft: false },
  closed: { state: 'CLOSED', isDraft: false },
};

const pullOfStack = (pull: StackPull): Pull[] => {
  if (pull.number === null || pull.state === 'unknown') {
    return [];
  }

  return [
    pullFacts({
      number: pull.number,
      headRefName: pull.branch,
      title: pull.title ?? '',
      ...pullStates[pull.state],
    }),
  ];
};

const branchOf = (pull: StackPull): StackBranch => ({
  branch: pull.branch,
  pullNumber: pull.number,
  restack: pull.restack,
});

// Recorded facts for one space, so a row search reads its stack through the same place and worktree
// branch the data layer stores.
export const stackFacts = (fields: {
  folder: string;
  branch: string | null;
  stack: SpaceStack;
  livePulls: Pull[];
  failed?: boolean;
}): Facts => {
  const { folder, branch, stack, livePulls, failed = false } = fields;
  const place = placeOf(null, folder);
  const worktree = worktreeOf(null, folder);
  const repository = repositoryOf(null, `${folder}/.git`);

  return {
    git: {
      places: { [place.key]: { kind: 'repository', worktree: worktree.key } },
      worktrees: {
        [worktree.key]: {
          repository,
          root: folder,
          branch,
          linked: false,
          bare: false,
        },
      },
    },
    pulls: { [repository.key]: { pulls: livePulls, failed } },
    trackers: {},
    stacks: {
      [repository.key]: {
        stacks: [{ trunk: 'main', branches: stack.pulls.map(branchOf) }],
        failed: false,
      },
    },
  };
};

export const factsWithStack = (
  folder: string,
  stack: SpaceStack,
  livePulls: Pull[] = stack.pulls.flatMap(pullOfStack),
): Facts =>
  stackFacts({
    folder,
    branch: stack.pulls[0]?.branch ?? null,
    stack,
    livePulls,
  });
