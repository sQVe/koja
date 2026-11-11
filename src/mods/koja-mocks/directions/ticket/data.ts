import type { ContentItem } from '../content/data.ts';

type TicketKind = 'container' | 'single';

export type TicketState =
  | 'container'
  | 'single'
  | 'loading'
  | 'unreachable'
  | 'sync-failed'
  | 'nothing-ready'
  | 'done'
  | 'plain'
  | 'tikk'
  | 'long'
  | 'normal'
  | 'wide';

export type Readiness = 'merged' | 'in review' | 'in progress' | 'ready' | 'blocked';

type TrackerStatus = 'Done' | 'In Progress' | 'Backlog' | 'draft' | 'open' | 'canceled';

export interface Slice {
  identifier: string;
  title: string;
  tracker: TrackerStatus;
  readiness: Readiness;
  pull?: string;
  pullState?: string;
  detail?: string;
}

export interface WorkItem {
  title: string;
  state: 'done' | 'in progress' | 'todo';
  identifier?: string;
  tracker?: TrackerStatus;
}

export interface TicketView {
  state: TicketState;
  item: ContentItem;
  slices: Slice[];
  agents: Record<string, WorkItem[]>;
  criteria: WorkItem[];
  currentIdentifier: string | null;
}

export const isActiveSlice = (slice: Slice): boolean =>
  slice.readiness === 'in review' || slice.readiness === 'in progress';

export const slices: Slice[] = [
  {
    identifier: 'ME-1281',
    title: 'Add two-line space rows',
    tracker: 'Done',
    readiness: 'merged',
    pull: '#54',
    pullState: 'merged',
  },
  {
    identifier: 'ME-1282',
    title: 'Add work-need marks',
    tracker: 'Done',
    readiness: 'merged',
    pull: '#55',
    pullState: 'merged',
  },
  {
    identifier: 'ME-1283',
    title: 'Add the space footer links',
    tracker: 'In Progress',
    readiness: 'in review',
    pull: '#58',
    pullState: 'open',
    detail: 'checks passing · 1 unresolved thread',
  },
  {
    identifier: 'ME-1284',
    title: 'Add Go to for PRs',
    tracker: 'In Progress',
    readiness: 'in progress',
    pull: '#59',
    pullState: 'draft',
    detail: 'stacked on koja #58 · 2 of 3 agent tickets done',
  },
  {
    identifier: 'ME-1285',
    title: 'Fold project groups',
    tracker: 'Backlog',
    readiness: 'ready',
    detail: 'Ready · stacks on koja #58',
  },
  {
    identifier: 'ME-1286',
    title: 'Show the stack hover card',
    tracker: 'Backlog',
    readiness: 'blocked',
    detail: 'blocked by ME-1285',
  },
  {
    identifier: 'ME-1287',
    title: 'Judge the live sidebar',
    tracker: 'Backlog',
    readiness: 'blocked',
    detail: 'blocked by ME-1286',
  },
];

export const acceptance: Record<TicketKind, WorkItem[]> = {
  container: [
    { title: 'Every space shows its two-line row', state: 'done' },
    { title: 'Go to finds a PR in any stack', state: 'todo' },
    { title: 'The judges pass the live sidebar', state: 'todo' },
  ],
  single: [
    { title: 'The footer shows the ticket and PR links', state: 'done' },
    { title: 'A ticket link opens the tracker', state: 'done' },
    { title: 'A PR link opens GitHub', state: 'todo' },
    { title: 'Stack › opens the stack panel', state: 'todo' },
    { title: 'The footer truncates a long branch', state: 'todo' },
  ],
};

const agentTickets: WorkItem[] = [
  { identifier: 'AI-412', title: 'Draw the footer links', state: 'done' },
  { identifier: 'AI-413', title: 'Route ticket links to the tracker', state: 'in progress' },
  { identifier: 'AI-414', title: 'Add footer tests', state: 'todo' },
];

export const sliceAgents: Record<string, WorkItem[]> = {
  'ME-1283': agentTickets,
  'ME-1284': [
    { identifier: 'AI-418', title: 'Match PR numbers', state: 'done' },
    { identifier: 'AI-419', title: 'Search merged stacks', state: 'done' },
    { identifier: 'AI-420', title: 'Explain matches', state: 'in progress' },
  ],
};

export const ticketItems: Record<TicketKind, ContentItem> = {
  container: {
    kind: 'ticket',
    name: 'Ticket',
    identifier: 'ME-1280',
    source: 'Linear',
    title: 'Build the sidebar',
    tab: 'ME-1280 Build the sidebar',
    state: 'In progress',
    readAge: '1m ago',
    icon: 'file',
    facts: [
      { name: 'Project', value: 'Koja' },
      { name: 'Related', value: 'ME-1090', target: 'Linear' },
    ],
    description: [
      'Build the approved sidebar design into koja-spaces. Each slice is one PR.',
      'The design lives in ME-1090. The last slice judges the live sidebar.',
    ],
  },
  single: {
    kind: 'ticket',
    name: 'Ticket',
    identifier: 'ME-1283',
    source: 'Linear',
    title: 'Add the space footer links',
    tab: 'ME-1283 Add the space footer links',
    state: 'In progress',
    readAge: '1m ago',
    icon: 'file',
    facts: [
      { name: 'Project', value: 'Koja' },
      { name: 'Parent', value: 'ME-1280', target: 'Linear' },
    ],
    description: [
      "Add the ticket and PR links and Stack › to the selected space's footer. Links open the ticket in its tracker and the PR on GitHub.",
    ],
  },
};
