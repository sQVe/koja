import type { IconName } from '../../../../kit/index.ts';
import type { FakeChange } from '../../scenes/shellContent.ts';

export type ContentKind = 'review' | 'pr' | 'ticket';

export interface ContentItem {
  kind: ContentKind;
  name: string;
  identifier: string;
  title: string | null;
  tab: string;
  state: string | null;
  icon: IconName;
  description: string[];
  facts: { name: string; value: string; link?: boolean }[];
}

export const contentItems: Record<ContentKind, ContentItem> = {
  review: {
    kind: 'review',
    name: 'Draft review',
    identifier: 'ME-1092',
    title: 'Review design.md',
    tab: 'Review design.md',
    state: 'open',
    icon: 'square-pen',
    description: [],
    facts: [
      { name: 'From', value: 'Tau · draft review' },
      { name: 'Comments', value: '2 line comments' },
      { name: 'Saved', value: 'saved 1m ago' },
    ],
  },
  pr: {
    kind: 'pr',
    name: 'Pull request',
    identifier: '#41',
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
      { name: 'Ticket', value: 'ME-1090', link: true },
      { name: 'Checks', value: '2 running, 1 failing' },
      { name: 'Threads', value: '2 unresolved' },
      { name: 'Files', value: '9 changed · +412 −38' },
    ],
  },
  ticket: {
    kind: 'ticket',
    name: 'Ticket',
    identifier: 'ME-1094',
    title: 'Design the ticket view',
    tab: 'ME-1094 Design the ticket view',
    state: 'Backlog',
    icon: 'file',
    description: [
      'Show one ticket with its slices, state, and links inside a content pane.',
      'Start with a read-only view of Linear. Keep the shared frame ready for tikk without adding editing controls.',
    ],
    facts: [
      { name: 'Project', value: 'Koja' },
      { name: 'Parent', value: 'ME-1087', link: true },
      { name: 'Slices', value: '1 done · 1 in progress · 1 backlog' },
      { name: 'Related PR', value: '#52', link: true },
    ],
  },
};

export const reviewFiles = ['design.md', 'slice-1.md', 'slice-2.md'];

export const reviewLines = [
  '# Content pane pattern',
  '',
  '## Goal',
  'Show one work item without leaving Koja.',
  'Keep the terminal beside the work when useful.',
  'The item owns its title, state, and actions.',
  '',
  '## Shared frame',
  '- Use the same pane chrome as a terminal.',
  '- Keep links to the source easy to find.',
  '- Let the body use the space it needs.',
  '- Show facts beside a wide document.',
  '- Move facts below the title when narrow.',
  '- Keep one clear action for draft reviews.',
  '',
  '## Recovery',
  'Keep the last good read when a refresh fails.',
  'Show Retry beside the part that failed.',
  'Never discard a comment after a failed save.',
  'Done sends the review back to Tau.',
];

export const reviewComments = [
  { end: 6, range: 'L6', text: 'Keep the kind in pane chrome; the title belongs to the item.' },
  {
    end: 14,
    range: 'L12–14',
    text: 'Show the narrow layout beside the terminal in the next round.',
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
  { title: '1. Read the ticket snapshot', state: 'done', status: 'done' },
  { title: '2. Draw the shared content frame', state: 'in progress', status: 'working' },
  { title: '3. Check links and empty states', state: 'backlog', status: 'idle' },
] as const;
