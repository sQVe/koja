import type { Status } from 'herdr';

// The most urgent thing the work needs from the user, across every open PR of the space's stack.
export type WorkNeed = 'conflict' | 'failing' | 'review' | 'restack' | 'merge';

interface FakeStack {
  merged: number;
  total: number;
  current: number;
}

export interface FakeSpace {
  title: string;
  ticket?: string;
  pull?: number;
  agent: Status | null;
  need?: WorkNeed;
  stack?: FakeStack;
  selected: boolean;
  age: string;
}

export interface FakeProject {
  name: string;
  spaces: FakeSpace[];
}

export const fakeProjects: FakeProject[] = [
  {
    name: 'koja',
    spaces: [
      {
        title: 'Build window shell',
        ticket: 'ME-1089',
        pull: 31,
        agent: 'blocked',
        need: 'failing',
        stack: { merged: 2, total: 5, current: 3 },
        selected: false,
        age: '2m',
      },
      {
        title: 'Design the sidebar',
        ticket: 'ME-1090',
        pull: 41,
        agent: 'working',
        stack: { merged: 3, total: 8, current: 6 },
        selected: true,
        age: 'now',
      },
      {
        title: 'Tau workflow sidebar',
        ticket: 'ME-1031',
        pull: 36,
        agent: 'done',
        need: 'merge',
        stack: { merged: 3, total: 8, current: 8 },
        selected: false,
        age: '18m',
      },
      {
        title: 'Fix the PR badge color',
        pull: 33,
        agent: 'idle',
        need: 'review',
        selected: false,
        age: '1h',
      },
    ],
  },
  {
    name: 'tau',
    spaces: [
      {
        title: 'Hill-climb mode for judges',
        ticket: 'ME-1157',
        pull: 39,
        agent: 'working',
        need: 'restack',
        stack: { merged: 1, total: 3, current: 2 },
        selected: false,
        age: '5m',
      },
    ],
  },
  {
    name: 'tikk',
    spaces: [
      {
        title: 'Ticket sync',
        pull: 12,
        agent: null,
        selected: false,
        age: '1d',
      },
      {
        title: 'Import tickets from Linear',
        ticket: 'ME-1124',
        agent: 'idle',
        selected: false,
        age: '3d',
      },
    ],
  },
];
