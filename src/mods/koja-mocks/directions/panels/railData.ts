import type { FakeChange, FakePane } from '../../scenes/shellContent.ts';
import { agentPane, changeRows } from '../../scenes/shellContent.ts';
import type { FakeProject, FakeSpace } from '../sidebars/content.ts';
import { fakeProjects } from '../sidebars/content.ts';
import type { FakePull, FakeWorker } from './data.ts';
import { branchChanges, focusedSpace, stackPulls, workers } from './data.ts';

interface FakeBranch {
  name: string;
  commits: number;
  add: number;
  del: number;
}

interface RailChanges {
  uncommitted: FakeChange[];
  uncommittedTotal: number;
  branch: FakeChange[];
  branchTotal: number;
  branchView: boolean;
  hasBase: boolean;
}

type PullFacts = Pick<FakePull, 'pull' | 'ticket' | 'title'> & Partial<FakePull>;

export type RailCase = 'busy' | 'clean' | 'single' | 'noPull' | 'main' | 'error' | 'base';

export interface RailState {
  space: FakeSpace;
  agent?: FakePane;
  pulls: FakePull[];
  branch?: FakeBranch;
  onMain: boolean;
  changes: RailChanges;
  workers: FakeWorker[];
  readFailed?: string;
}

const baseChanges: RailChanges = {
  uncommitted: changeRows,
  uncommittedTotal: changeRows.length,
  branch: branchChanges,
  branchTotal: branchChanges.length,
  branchView: false,
  hasBase: true,
};

const checkedOut = stackPulls.filter((pull) => pull.checkedOut);

export const baseRail: RailState = {
  space: focusedSpace,
  pulls: stackPulls,
  onMain: false,
  changes: baseChanges,
  workers,
};

export const projectsWith = (space: FakeSpace): FakeProject[] =>
  fakeProjects.map((project) => ({
    name: project.name,
    spaces: project.spaces.map((candidate) => (candidate.selected ? space : candidate)),
  }));

const pull = (facts: PullFacts): FakePull => ({ state: 'open', checkedOut: false, ...facts });

const busyPulls: FakePull[] = [
  pull({ pull: 48, ticket: 'ME-1195', title: 'Pin the current PR', state: 'draft' }),
  pull({ pull: 47, ticket: 'ME-1194', title: 'Stack panel keys', state: 'draft' }),
  pull({
    pull: 44,
    ticket: 'ME-1181',
    title: 'Find a space by PR',
    checks: '4 checks passed',
    threads: 1,
  }),
  pull({
    pull: 43,
    ticket: 'ME-1180',
    title: 'Stack hover card',
    checks: '4 checks passed',
    need: 'restack',
  }),
  pull({
    pull: 41,
    ticket: 'ME-1090',
    title: 'Design the sidebar',
    checkedOut: true,
    checks: '3 checks running',
    diff: { add: 1240, del: 318 },
  }),
  pull({
    pull: 38,
    ticket: 'ME-1178',
    title: 'Stack progress and footer',
    checks: '1 check failed',
    need: 'failing',
  }),
  pull({
    pull: 37,
    ticket: 'ME-1177',
    title: 'Show what PRs need',
    checks: '5 checks passed',
    need: 'review',
  }),
  pull({ pull: 35, ticket: 'ME-1176', title: 'Calm one-line rows', state: 'merged' }),
  pull({ pull: 34, ticket: 'ME-1175', title: 'Sidebar parts in the kit', state: 'merged' }),
  pull({ pull: 33, ticket: 'ME-1174', title: 'Remove the narrow rail', state: 'merged' }),
  pull({ pull: 31, ticket: 'ME-1172', title: 'Space rows in the kit', state: 'merged' }),
  pull({ pull: 30, ticket: 'ME-1171', title: 'Rename spaces', state: 'merged' }),
];

const busyFiles: FakeChange[] = [
  { path: 'docs/adr/0014-side-panel-structure.md', status: 'A', add: 42, del: 0 },
  { path: 'src/kit/button.ts', status: 'M', add: 2, del: 6 },
  { path: 'src/kit/listRow.ts', status: 'A', add: 12, del: 0 },
  { path: 'src/kit/paneHeader.ts', status: 'A', add: 24, del: 0 },
  { path: 'src/kit/treeRow.ts', status: 'A', add: 88, del: 0 },
  { path: 'src/mods/koja-spaces/main.ts', status: 'M', add: 31, del: 12 },
  { path: 'src/mods/koja-spaces/stackBar.ts', status: 'A', add: 64, del: 0 },
  { path: 'tests/panels.test.ts', status: 'A', add: 120, del: 0 },
];

const asking = (text: string, asked: string): Pick<FakeWorker, 'status' | 'question'> => ({
  status: 'blocked',
  question: { text, asked },
});

const busyWorkers: FakeWorker[] = [
  {
    task: 'Judge direction-koja',
    profile: 'scout',
    left: '17m left',
    selected: false,
    ...asking('Should the judge score the normal mode crops too?', '5m ago'),
  },
  {
    task: 'Pick the ring size',
    profile: 'worker',
    left: '22m left',
    selected: true,
    ...asking('Keep the 6 px ring for a space with no agent, or use 8 px?', '2m ago'),
  },
  {
    task: 'Port the shell scene',
    profile: 'worker',
    status: 'working',
    left: '38m left',
    selected: false,
  },
  { task: 'Mock scenes', profile: 'worker', status: 'working', left: '41m left', selected: false },
  {
    task: 'Restack onto main',
    profile: 'worker',
    status: 'done',
    left: 'report ready',
    selected: false,
  },
];

const busy: RailState = {
  space: { ...focusedSpace, stack: { merged: 5, total: 12, current: 8 } },
  pulls: busyPulls,
  onMain: false,
  changes: {
    ...baseChanges,
    uncommitted: busyFiles,
    uncommittedTotal: 48,
    branchTotal: 63,
  },
  workers: busyWorkers,
};

const clean: RailState = {
  ...baseRail,
  changes: { ...baseChanges, uncommitted: [], uncommittedTotal: 0, branchView: true },
  workers: [],
};

const { stack: _stack, ...unstacked } = focusedSpace;

const single: RailState = { ...baseRail, space: unstacked, pulls: checkedOut };

const { pull: _pull, ...withoutPull } = unstacked;

const runningWorkers = workers.filter((worker) => worker.status === 'working');

const noPull: RailState = {
  space: withoutPull,
  pulls: [],
  branch: { name: 'me-1090-design-the-sidebar', commits: 2, add: 126, del: 19 },
  onMain: false,
  changes: { ...baseChanges, branch: [], branchTotal: 5 },
  workers: runningWorkers,
};

const mainTask = 'Try ideas on main';

const mainFiles: FakeChange[] = [
  { path: 'README.md', status: 'M', add: 6, del: 2 },
  { path: 'config/settings.json', status: 'M', add: 1, del: 1 },
];

const onMain: RailState = {
  space: { title: mainTask, agent: 'working', selected: true, age: 'now' },
  agent: { ...agentPane, task: mainTask, branch: 'main' },
  pulls: [],
  onMain: true,
  changes: {
    uncommitted: mainFiles,
    uncommittedTotal: mainFiles.length,
    branch: [],
    branchTotal: 0,
    branchView: false,
    hasBase: false,
  },
  workers: runningWorkers,
};

const readFailed: RailState = { ...baseRail, readFailed: '4m ago' };

export const railStates: Record<RailCase, RailState> = {
  busy,
  clean,
  single,
  noPull,
  main: onMain,
  error: readFailed,
  base: baseRail,
};
