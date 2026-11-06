import type { Program, Status } from 'herdr';

import type { FileStatus, RowState } from '../../../kit/index.ts';

export interface FakeSpace {
  label: string;
  status: Status | null;
  state: RowState;
  pull?: number;
  badge?: string;
}

export interface FakeRepo {
  name: string;
  branch: string;
  age: string;
  status: Status | null;
  spaces: FakeSpace[];
}

export interface FakeTab {
  label: string;
  active: boolean;
  status: Status | null;
  program: Program;
}

export interface FakePane {
  program: Program;
  name: string;
  task?: string;
  branch?: string;
  folder: string;
  status: Status | null;
  lines: string[];
}

export interface FakeChange {
  path: string;
  status: FileStatus;
  add: number;
  del: number;
}

const agentProgram: Program = {
  key: 'claude',
  name: 'Claude Code',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: false,
  agent: true,
};

const shellProgram: Program = {
  key: 'shell',
  name: 'zsh',
  icon: null,
  tint: false,
  tile: null,
  color: null,
  shell: true,
  agent: false,
};

export const fakeRepos: FakeRepo[] = [
  {
    name: 'koja',
    branch: 'main',
    age: '2h',
    status: 'blocked',
    spaces: [
      { label: 'me-1089-window-shell', status: 'working', state: 'selected', pull: 31 },
      { label: 'me-1088-ui-foundation', status: 'idle', state: 'normal' },
      { label: 'fix-pr-badge', status: 'blocked', state: 'normal', badge: 'Needs you' },
    ],
  },
  {
    name: 'tikk',
    branch: 'main',
    age: '1d',
    status: 'done',
    spaces: [{ label: 'ticket-sync', status: 'done', state: 'normal', pull: 12 }],
  },
];

export const fakeTabs: FakeTab[] = [
  { label: 'Build window shell', active: true, status: 'working', program: agentProgram },
  { label: 'Review judge findings', active: false, status: 'blocked', program: agentProgram },
  { label: 'Wire the tab bar', active: false, status: 'done', program: agentProgram },
  { label: 'zsh', active: false, status: null, program: shellProgram },
];

export const agentPane: FakePane = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Build window shell',
  branch: 'me-1089-window-shell',
  folder: '~/code/koja',
  status: 'working',
  lines: ['> bun run check', 'typecheck      ok', 'style:check    ok', 'tests          running'],
};

export const shellPane: FakePane = {
  program: shellProgram,
  name: 'zsh',
  branch: 'main',
  folder: '~/code/tikk',
  status: null,
  lines: [
    '$ git log --oneline -3',
    'a1b2c3d Wire the tab bar',
    'e4f5a6b Review judge findings',
    'c7d8e9f Build window shell',
  ],
};

export const changeRows: FakeChange[] = [
  { path: 'src/kit/paneHeader.ts', status: 'A', add: 24, del: 0 },
  { path: 'src/kit/listRow.ts', status: 'A', add: 12, del: 0 },
  { path: 'src/kit/button.ts', status: 'M', add: 2, del: 6 },
];
