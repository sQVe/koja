import type { IconName } from '../../../../kit/index.ts';
import type { FakeChange } from '../../scenes/shellContent.ts';

export type ContentKind = 'review' | 'pr' | 'ticket';
export type SourceTarget = 'GitHub' | 'Linear';
export type CheckState = 'failing' | 'running' | 'passed';

export interface ContentFact {
  name: string;
  value: string;
  target?: SourceTarget | 'agent';
  checkState?: CheckState;
  age?: string;
  warning?: boolean;
  wrap?: boolean;
  diff?: { added: number; removed: number };
}

export interface ContentItem {
  kind: ContentKind;
  name: string;
  identifier: string;
  source: SourceTarget;
  readAge: string | null;
  unsaved?: boolean;
  title: string | null;
  tab: string;
  state: string | null;
  icon: IconName;
  description: string[];
  facts: ContentFact[];
}

export const contentItems: Record<ContentKind, ContentItem> = {
  review: {
    kind: 'review',
    name: 'Draft review',
    identifier: 'ME-1090',
    source: 'Linear',
    readAge: null,
    title: 'Review design.md',
    tab: 'Review design.md',
    state: 'in review',
    icon: 'square-pen',
    description: [],
    facts: [
      { name: 'From', value: 'Tau' },
      { name: 'Agent', value: 'Design the sidebar', target: 'agent' },
      { name: 'Comments', value: '2 line comments' },
      { name: 'Saved', value: '1m ago' },
    ],
  },
  pr: {
    kind: 'pr',
    name: 'Pull request',
    identifier: '#41',
    source: 'GitHub',
    readAge: '1m ago',
    title: 'Design the sidebar',
    tab: '#41 Design the sidebar',
    state: 'open',
    icon: 'git-compare',
    description: [
      'Keep repository and branch context visible while moving between spaces.',
      'Adds project groups, work-need marks, and a quieter selected row. The inbox keeps items that need a decision together.',
    ],
    facts: [
      { name: 'Branch', value: 'me-1090-design-the-sidebar → main' },
      { name: 'Ticket', value: 'ME-1090', target: 'Linear' },
      { name: 'Checks', value: '1 failing · 2 running', checkState: 'failing' },
      { name: 'Threads', value: '2 unresolved' },
      { name: 'Files', value: '9 changed', diff: { added: 412, removed: 38 } },
    ],
  },
  ticket: {
    kind: 'ticket',
    name: 'Ticket',
    identifier: 'ME-1094',
    source: 'Linear',
    readAge: '1m ago',
    title: 'Design the ticket view',
    tab: 'ME-1094 Design the ticket view',
    state: 'In progress',
    icon: 'file',
    description: [
      'Show one ticket with its slices, state, and links inside a content pane.',
      'Start with a read-only view of Linear. Keep the shared frame ready for tikk without adding editing controls.',
    ],
    facts: [
      { name: 'Project', value: 'Koja' },
      { name: 'Parent', value: 'ME-1087', target: 'Linear' },
      { name: 'Related PR', value: '#52', target: 'GitHub' },
    ],
  },
};

export const reviewFiles = ['design.md', 'slice-1.md', 'slice-2.md'];

export const reviewLines = [
  '# Sidebar design',
  '',
  '## Goal',
  'Keep projects and spaces easy to scan.',
  'Keep the terminal beside the work when useful.',
  'The sidebar keeps each space and its work visible.',
  '',
  '## Shared frame',
  '- Group spaces by project.',
  '- Keep links to the source easy to find.',
  '- Use one selected row per active space.',
  '- Show work-need marks beside each space.',
  '- Keep branch names quiet until needed.',
  '- Keep the selected space visible when folded.',
  '',
  '## Recovery',
  'Keep the last good read when a refresh fails.',
  'Show Retry beside the part that failed.',
  'Never discard a comment after a failed save.',
  'Send to Tau returns the review to the agent.',
];

export const reviewComments = [
  {
    start: 6,
    end: 6,
    range: 'L6',
    text: 'Keep the selected space visible when the project folds.',
  },
  {
    start: 12,
    end: 14,
    range: 'L12–14',
    text: 'Keep work-need marks visible when the group is folded.',
  },
];

export const pullFiles: FakeChange[] = [
  { path: 'src/mods/koja-spaces/main.ts', status: 'M', add: 128, del: 16 },
  { path: 'src/mods/koja-spaces/rows.ts', status: 'A', add: 86, del: 0 },
  { path: 'src/mods/koja-spaces/rows.test.ts', status: 'A', add: 74, del: 0 },
  { path: 'src/kit/workNeedMark.ts', status: 'A', add: 32, del: 0 },
  { path: 'src/kit/workNeedMark.test.ts', status: 'A', add: 26, del: 0 },
  { path: 'src/kit/repoLabel.ts', status: 'M', add: 18, del: 10 },
  { path: 'src/kit/size.ts', status: 'M', add: 8, del: 4 },
  { path: 'src/kit/index.ts', status: 'M', add: 6, del: 2 },
  { path: 'config/layouts/koja.json', status: 'M', add: 34, del: 6 },
];

export const ticketSlices = [
  { title: 'Read the ticket snapshot', state: 'done', status: 'done' },
  { title: 'Draw the shared content frame', state: 'in progress', status: 'working' },
  { title: 'Check links and empty states', state: 'backlog', status: 'idle' },
] as const;
