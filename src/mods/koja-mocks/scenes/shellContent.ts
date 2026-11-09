import type { Program, Status } from 'herdr';

import type { FileStatus } from '../../../kit/index.ts';

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

export const fakeTabs: FakeTab[] = [
  { label: 'Design the sidebar', active: true, status: 'working', program: agentProgram },
  { label: 'Judge round', active: false, status: 'done', program: agentProgram },
  { label: 'Mock scenes', active: false, status: 'working', program: agentProgram },
  { label: 'zsh', active: false, status: null, program: shellProgram },
];

export const agentPane: FakePane = {
  program: agentProgram,
  name: 'Claude Code',
  task: 'Design the sidebar',
  branch: 'me-1090-design-the-sidebar',
  folder: '~/code/koja',
  status: 'working',
  lines: ['> bun run check', 'typecheck      ok', 'style:check    ok', 'tests          running'],
};

export const shellPane: FakePane = {
  program: shellProgram,
  name: 'zsh',
  branch: 'main',
  folder: '~/code/koja',
  status: null,
  lines: [
    '$ git log --oneline -3',
    'a1b2c3d Add the hover card',
    'e4f5a6b Add the inbox view',
    'c7d8e9f Add state icons to the kit',
  ],
};

export const changeRows: FakeChange[] = [
  { path: 'src/kit/paneHeader.ts', status: 'A', add: 24, del: 0 },
  { path: 'src/kit/listRow.ts', status: 'A', add: 12, del: 0 },
  { path: 'src/kit/button.ts', status: 'M', add: 2, del: 6 },
];
