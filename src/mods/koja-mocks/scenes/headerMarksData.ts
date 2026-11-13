import type { Status } from 'herdr';

import type { WorkNeed } from '../../../kit/index.ts';

type HeaderLook = 'normal' | 'selected' | 'hovered';

export interface MarkSpace {
  title: string;
  agent: Status | null;
  age?: string;
  need?: WorkNeed;
  stack?: { merged: number; total: number };
}

// The header is the project's main space, so its agent and age belong to that space.
export interface MarkProject {
  name: string;
  machine?: string;
  main: { agent: Status | null; age?: string; look: HeaderLook };
  spaces: MarkSpace[];
}

export const markProjects: MarkProject[] = [
  {
    name: 'koja',
    main: { agent: 'working', look: 'selected' },
    spaces: [
      {
        title: 'Build window shell',
        agent: 'blocked',
        age: '4m',
        need: 'failing',
        stack: { merged: 2, total: 5 },
      },
      { title: 'Design the sidebar', agent: 'working', stack: { merged: 3, total: 8 } },
      { title: 'Fix the PR badge color', agent: 'idle', age: '2h', need: 'review' },
    ],
  },
  {
    name: 'herdr-app',
    machine: 'build-box',
    main: { agent: 'blocked', age: '6m', look: 'hovered' },
    spaces: [
      { title: 'Pane equalize', agent: 'working' },
      { title: 'Swap pane by target', agent: 'done', age: '18m', need: 'merge' },
    ],
  },
  {
    name: 'tau',
    main: { agent: 'done', age: '12m', look: 'normal' },
    spaces: [
      {
        title: 'Hill-climb mode for judges',
        agent: 'working',
        need: 'restack',
        stack: { merged: 1, total: 3 },
      },
    ],
  },
  {
    name: 'tikk',
    main: { agent: 'idle', age: '3h', look: 'normal' },
    spaces: [
      { title: 'Ticket sync', agent: null, age: '2d' },
      { title: 'Import tickets from Linear', agent: 'idle', age: '5h' },
    ],
  },
  {
    name: 'dotfiles',
    main: { agent: null, age: '4d', look: 'normal' },
    spaces: [{ title: 'Zsh prompt timing', agent: 'idle', age: '1d' }],
  },
];
