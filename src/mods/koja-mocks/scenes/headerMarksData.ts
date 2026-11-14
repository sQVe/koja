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

export interface MarkProject {
  name: string;
  machine?: string;
  look: HeaderLook;
  hidden: number;
  main: { agent: Status | null; age?: string } | null;
  spaces: MarkSpace[];
}

export const markProjects: MarkProject[] = [
  {
    name: 'platform',
    look: 'normal',
    hidden: 7,
    main: { agent: 'idle', age: 'now' },
    spaces: [{ title: 'Sign-in returns to link', agent: 'blocked', age: '9m' }],
  },
  {
    name: 'koja',
    look: 'selected',
    hidden: 0,
    main: { agent: 'working' },
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
    look: 'hovered',
    hidden: 0,
    main: { agent: 'blocked', age: '6m' },
    spaces: [
      { title: 'Pane equalize', agent: 'working' },
      { title: 'Swap pane by target', agent: 'done', age: '18m', need: 'merge' },
    ],
  },
  {
    name: 'tau',
    look: 'normal',
    hidden: 0,
    main: { agent: 'done', age: '12m' },
    spaces: [{ title: 'Hill-climb judges', agent: 'working', need: 'restack' }],
  },
  {
    name: 'tikk',
    look: 'normal',
    hidden: 0,
    main: { agent: 'idle', age: '3h' },
    spaces: [
      { title: 'Ticket sync', agent: null, age: '2d' },
      { title: 'Import from Linear', agent: 'idle', age: '5h' },
    ],
  },
  {
    name: 'stomme',
    look: 'normal',
    hidden: 0,
    main: null,
    spaces: [{ title: 'Base repository and check', agent: 'working' }],
  },
  {
    name: 'greppa',
    look: 'normal',
    hidden: 2,
    main: null,
    spaces: [],
  },
  {
    name: 'dotfiles',
    look: 'normal',
    hidden: 0,
    main: { agent: null, age: '4d' },
    spaces: [{ title: 'Zsh prompt timing', agent: 'idle', age: '1d' }],
  },
];
