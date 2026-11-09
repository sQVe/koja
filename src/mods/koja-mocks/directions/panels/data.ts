import type { Status } from 'herdr';

import type { FileStatus } from '../../../../kit/index.ts';
import type { FakeChange } from '../../scenes/shellContent.ts';
import { changeRows } from '../../scenes/shellContent.ts';
import type { FakeSpace, WorkNeed } from '../sidebars/content.ts';
import { fakeProjects } from '../sidebars/content.ts';

type PullState = 'open' | 'draft' | 'merged';

interface FakeDiff {
  add: number;
  del: number;
}

export interface FakePull {
  pull: number;
  ticket: string;
  title: string;
  state: PullState;
  checkedOut: boolean;
  checks?: string;
  threads?: number;
  diff?: FakeDiff;
  need?: WorkNeed;
}

interface FakeQuestion {
  text: string;
  asked: string;
}

export interface FakeWorker {
  task: string;
  profile: string;
  status: Status;
  left: string;
  selected: boolean;
  question?: FakeQuestion;
}

export interface FakeTreeEntry {
  name: string;
  depth: number;
  folder: boolean;
  open: boolean;
  status?: FileStatus;
  changed: boolean;
}

const unknownSpace: FakeSpace = { title: '', agent: null, selected: false, age: '' };

export const focusedSpace: FakeSpace =
  fakeProjects.flatMap((project) => project.spaces).find((space) => space.selected) ?? unknownSpace;

// Top of the stack first, as stack tools list it.
export const stackPulls: FakePull[] = [
  { pull: 44, ticket: 'ME-1181', title: 'Find a space by PR', state: 'draft', checkedOut: false },
  { pull: 43, ticket: 'ME-1180', title: 'Stack hover card', state: 'draft', checkedOut: false },
  {
    pull: 41,
    ticket: 'ME-1090',
    title: 'Design the sidebar',
    state: 'open',
    checkedOut: true,
    checks: '2 checks running',
    diff: { add: 38, del: 6 },
  },
  {
    pull: 40,
    ticket: 'ME-1178',
    title: 'Stack progress and footer',
    state: 'open',
    checkedOut: false,
    checks: '1 check failed',
    need: 'failing',
  },
  {
    pull: 38,
    ticket: 'ME-1177',
    title: 'Show what PRs need',
    state: 'open',
    checkedOut: false,
    checks: '5 checks passed',
    threads: 2,
    need: 'review',
  },
  { pull: 37, ticket: 'ME-1176', title: 'Calm one-line rows', state: 'merged', checkedOut: false },
  {
    pull: 35,
    ticket: 'ME-1175',
    title: 'Sidebar parts in the kit',
    state: 'merged',
    checkedOut: false,
  },
  {
    pull: 34,
    ticket: 'ME-1174',
    title: 'Remove the narrow rail',
    state: 'merged',
    checkedOut: false,
  },
];

export const managerName = 'Claude Code';

export const workers: FakeWorker[] = [
  {
    task: 'Port the shell scene',
    profile: 'worker',
    status: 'blocked',
    left: '22m left',
    selected: true,
    question: {
      text: 'Keep the 6 px ring for a space with no agent, or use 8 px?',
      asked: '2m ago',
    },
  },
  { task: 'Mock scenes', profile: 'worker', status: 'working', left: '41m left', selected: false },
  {
    task: 'Judge direction-koja',
    profile: 'scout',
    status: 'done',
    left: 'report ready',
    selected: false,
  },
];

export const branchChanges: FakeChange[] = [
  { path: 'src/mods/koja-spaces/main.ts', status: 'M', add: 96, del: 31 },
  { path: 'src/mods/koja-spaces/row.ts', status: 'A', add: 118, del: 0 },
  { path: 'src/mods/koja-spaces/stackBar.ts', status: 'A', add: 64, del: 0 },
  { path: 'src/mods/koja-spaces/main.test.ts', status: 'M', add: 81, del: 14 },
  { path: 'src/kit/index.ts', status: 'M', add: 6, del: 2 },
  { path: 'src/kit/iconNames.ts', status: 'M', add: 9, del: 4 },
  ...changeRows,
];

const folder = (name: string, depth: number, open: boolean, changed: boolean): FakeTreeEntry => ({
  name,
  depth,
  folder: true,
  open,
  changed,
});

const file = (name: string, depth: number, status?: FileStatus): FakeTreeEntry => ({
  name,
  depth,
  folder: false,
  open: false,
  changed: status !== undefined,
  ...(status === undefined ? {} : { status }),
});

export const fileTree: FakeTreeEntry[] = [
  folder('config', 0, false, false),
  folder('docs', 0, false, false),
  folder('scripts', 0, false, false),
  folder('src', 0, true, true),
  folder('kit', 1, true, true),
  file('button.ts', 2, 'M'),
  file('fileStatus.ts', 2),
  file('icon.ts', 2),
  file('listRow.ts', 2, 'A'),
  file('paneHeader.ts', 2, 'A'),
  file('size.ts', 2),
  file('statusMark.ts', 2),
  folder('mods', 1, false, false),
  file('AGENTS.md', 0),
  file('README.md', 0),
  file('package.json', 0),
];
