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

interface SliceIdentity {
  identifier: string;
  title: string;
}

interface ActiveFacts {
  detail: string;
  agent: string | null;
}

export type ActiveSlice = SliceIdentity &
  ActiveFacts & { readiness: 'PR open' | 'PR draft'; pull: string };

export type Slice =
  | ActiveSlice
  | (SliceIdentity &
      (
        | { readiness: 'merged' }
        | { readiness: 'ready'; stack: ActiveSlice }
        | { readiness: 'blocked'; blockedBy: string }
      ));

export type Readiness = Slice['readiness'];

export interface Criterion {
  title: string;
  state: 'done' | 'in progress' | 'todo';
}

export interface AgentTicket extends Criterion {
  identifier: string;
}

export interface TicketData {
  item: ContentItem;
  slices: Slice[];
  agents: Record<string, AgentTicket[]>;
  criteria: Criterion[];
}

export type TicketView = TicketData &
  ({ state: 'single'; current: ActiveSlice } | { state: Exclude<TicketState, 'single'> });

export const isActiveSlice = (slice: Slice): slice is ActiveSlice =>
  slice.readiness === 'PR open' || slice.readiness === 'PR draft';

export const footerSlice: ActiveSlice = {
  identifier: 'ME-1283',
  title: 'Add the space footer links',
  readiness: 'PR open',
  pull: '#58',
  detail: 'checks passing · 1 unresolved thread',
  agent: 'Design the sidebar',
};

export const slices: Slice[] = [
  { identifier: 'ME-1281', title: 'Add two-line space rows', readiness: 'merged' },
  { identifier: 'ME-1282', title: 'Add work-need marks', readiness: 'merged' },
  footerSlice,
  {
    identifier: 'ME-1284',
    title: 'Add Go to for PRs',
    readiness: 'PR draft',
    pull: '#59',
    detail: 'checks running · stacked on koja #58 · 2 of 3 agent tickets done',
    agent: null,
  },
  {
    identifier: 'ME-1285',
    title: 'Fold project groups',
    readiness: 'ready',
    stack: footerSlice,
  },
  {
    identifier: 'ME-1286',
    title: 'Show the stack hover card',
    readiness: 'blocked',
    blockedBy: 'ME-1285',
  },
  {
    identifier: 'ME-1287',
    title: 'Judge the live sidebar',
    readiness: 'blocked',
    blockedBy: 'ME-1286',
  },
];

export const acceptance: Record<TicketKind, Criterion[]> = {
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

export const sliceAgents: Record<string, AgentTicket[]> = {
  'ME-1283': [
    { identifier: 'AI-412', title: 'Draw the footer links', state: 'done' },
    { identifier: 'AI-413', title: 'Route ticket links to the tracker', state: 'in progress' },
    { identifier: 'AI-414', title: 'Add footer tests', state: 'todo' },
  ],
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
