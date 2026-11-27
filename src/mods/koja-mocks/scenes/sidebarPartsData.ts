import type { Status } from 'herdr';

import type { WorkNeed } from '../../../kit/index.ts';

export type RowLook = 'normal' | 'selected' | 'hovered';

export interface FakeSpace {
  title: string;
  agent: Status | null;
  need?: WorkNeed;
  stack?: { merged: number; total: number };
  look: RowLook;
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
        agent: 'blocked',
        need: 'failing',
        stack: { merged: 2, total: 5 },
        look: 'normal',
      },
      {
        title: 'Design the sidebar',
        agent: 'working',
        stack: { merged: 3, total: 8 },
        look: 'selected',
      },
      {
        title: 'Tau workflow sidebar',
        agent: 'done',
        need: 'merge',
        stack: { merged: 3, total: 8 },
        look: 'hovered',
      },
      { title: 'Fix the PR badge color', agent: 'idle', need: 'review', look: 'normal' },
    ],
  },
  {
    name: 'tau',
    spaces: [
      {
        title: 'Hill-climb mode for judges',
        agent: 'working',
        need: 'restack',
        stack: { merged: 1, total: 3 },
        look: 'normal',
      },
    ],
  },
  {
    name: 'tikk',
    spaces: [
      { title: 'Ticket sync', agent: null, look: 'normal' },
      { title: 'Import tickets from Linear', agent: 'idle', look: 'normal' },
    ],
  },
];

export const selectedLinks = ['ME-1090', '#41'];
