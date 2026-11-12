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

type LayerState = 'merged' | 'open' | 'draft' | 'checkedOut';

export interface FakeLayer {
  pull: number;
  ticket: string;
  title: string;
  state: LayerState;
  need?: WorkNeed;
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

export const hoveredProject = 'koja';

export const stackLayers: FakeLayer[] = [
  { pull: 502, ticket: 'ME-1032', title: 'Data layer', state: 'merged' },
  { pull: 504, ticket: 'ME-1033', title: 'Two-line rows', state: 'merged' },
  { pull: 505, ticket: 'ME-1034', title: 'Status marks', state: 'merged' },
  { pull: 507, ticket: 'ME-1035', title: 'Stack panel', state: 'open', need: 'merge' },
  { pull: 509, ticket: 'ME-1036', title: 'Row menu', state: 'open', need: 'review' },
  { pull: 511, ticket: 'ME-1037', title: 'Narrow rail', state: 'draft' },
  { pull: 512, ticket: 'ME-1038', title: 'Keys', state: 'draft' },
  { pull: 514, ticket: 'ME-1031', title: 'Tau workflow sidebar', state: 'checkedOut' },
];
