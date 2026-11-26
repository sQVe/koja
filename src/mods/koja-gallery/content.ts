import { h_flex, v_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';

import type {
  ContentSectionOptions,
  Fact,
  ItemStateOptions,
  PartNoteOptions,
  SourceLinkOptions,
  StatusRowOptions,
} from '../../kit/index.ts';
import {
  actionBlock,
  contentSection,
  contentSize,
  documentLine,
  factPairs,
  factRows,
  itemHeader,
  partNote,
  sourceLink,
  spacing,
  statusRow,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

type HeaderState = ItemStateOptions | null;

export interface ContentPartsOptions {
  folded: ReadonlySet<string>;
  onToggle: (name: string, cx: Context) => void;
}

const ticketFacts: Fact[] = [
  { label: 'Project', value: 'Koja' },
  { label: 'Parent', value: 'ME-1087', link: { source: 'Linear' } },
  {
    label: 'Related PR',
    value: '#52',
    link: { source: 'GitHub', repository: 'koja' },
    status: 'open',
  },
];

const longTitle =
  'Design the ticket view for long titles, related pull requests, and project context across several active development cycles';

const longFacts: Fact[] = [
  { label: 'Project', value: 'Koja' },
  {
    label: 'Parent',
    value:
      'ME-1087 · Build the developer cockpit for agents, tickets, GitHub work, and every active development session in one window',
    link: { source: 'Linear' },
  },
  { label: 'Labels', value: 'design · cockpit · accessibility' },
  { label: 'Assignee', value: 'You' },
  { label: 'Cycle', value: 'Cycle 12' },
  { label: 'Estimate', value: '5 points' },
  {
    label: 'Related PRs',
    value: '#52',
    link: { source: 'GitHub', repository: 'koja' },
    status: 'open',
  },
  {
    label: '',
    value: '#57',
    link: { source: 'GitHub', repository: 'koja' },
    status: 'open',
  },
  {
    label: '',
    value: '#63',
    link: { source: 'GitHub', repository: 'koja' },
    status: 'open',
  },
];

const sampleLinks: SourceLinkOptions[] = [
  { identifier: 'ME-1090', source: 'Linear' },
  { identifier: '#41', source: 'GitHub', repository: 'koja' },
];

const sourceLinks = (): Element => {
  const links = sampleLinks.map((options) => sourceLink(options));

  return h_flex().gap(spacing.large).items_center().children(links);
};

const pullHeader = (): Element =>
  itemHeader({
    kind: 'ready',
    identifier: '#41',
    source: 'GitHub',
    repository: 'koja',
    title: 'Design the sidebar',
    state: { kind: 'openPullRequest', label: 'open', age: '1m ago' },
  });

const ticketHeader = (state: HeaderState): Element =>
  itemHeader({
    kind: 'ready',
    identifier: 'ME-1094',
    source: 'Linear',
    title: 'Design the ticket view',
    state,
  });

const reviewHeader = (state: HeaderState): Element =>
  itemHeader({
    kind: 'ready',
    identifier: '#41',
    source: 'GitHub',
    repository: 'koja',
    title: 'Review design.md',
    state,
  });

const loadingHeader = (): Element =>
  itemHeader({ kind: 'loading', identifier: 'ME-1094', source: 'Linear' });

const longHeader = (): Element =>
  itemHeader({
    kind: 'ready',
    identifier: 'ME-1094',
    source: 'Linear',
    title: longTitle,
    state: { kind: 'inProgress', label: 'In progress', age: '1m ago' },
  });

const narrowFrame = (content: Element): Element =>
  v_flex().w(contentSize.narrowWidth).child(content);

const longTicket = (): Element => {
  const header = longHeader();
  const facts = factPairs(longFacts);
  const pane = v_flex().child(header).child(facts);

  return narrowFrame(pane);
};

const railFrame = (content: Element): Element =>
  v_flex().w(contentSize.railWidth).p(spacing.xxlarge).child(content);

const rail = (): Element => railFrame(factRows(ticketFacts));

// The gallery shows the parts, so its actions have nothing to run.
const noAction = (): void => undefined;

const readyAction = (): Element =>
  actionBlock({ kind: 'ready', action: 'Send to Tau', onAction: noAction });

const failedSaveAction = (): Element =>
  actionBlock({
    kind: 'failed',
    action: 'Retry save',
    onAction: noAction,
    failure: {
      error: 'Could not save: the folder is read-only',
      folder: '~/code/koja/.tau/reviews',
      recovery: [{ label: 'Copy path', onSelect: noAction }],
      unsaved: '1 line and 2 comments are unsaved. They stay in this pane.',
      wait: 'Send to Tau waits for a save.',
    },
  });

const sentAction = (): Element =>
  actionBlock({
    kind: 'sent',
    action: 'Sent to Tau',
    detail: 'Tau closes this pane after collecting the review.',
  });

const documentLines = (): Element => {
  const lines = [
    documentLine({ number: 1, text: '# Sidebar design' }),
    documentLine({ number: 2, text: '' }),
    documentLine({ number: 3, text: '## Goal' }),
    documentLine({ number: 4, text: 'Keep projects and spaces easy to scan.' }),
    documentLine({ number: 5, text: 'Keep the terminal beside the work when useful.' }),
    documentLine({
      number: 6,
      text: 'Keep the selected space visible when groups fold.',
      bar: 'edited',
    }),
    documentLine({ number: 7, text: '## Shared frame' }),
    documentLine({ number: 8, text: '- Group spaces by project.', bar: 'commented' }),
    documentLine({ number: 9, text: '- Keep links to the source easy to find.', bar: 'commented' }),
  ];

  return v_flex().children(lines);
};

const failingCheck = (stale: boolean): StatusRowOptions => ({
  mark: 'failing',
  name: 'typecheck',
  detail: 'Type mismatch in rows.ts:48',
  state: 'failing',
  stale,
});

const runningCheck = (name: string, started: string, stale: boolean): StatusRowOptions => ({
  mark: 'working',
  name,
  detail: `started ${started}`,
  state: 'running',
  stale,
});

const staleChecksNote: PartNoteOptions = { part: 'checks', age: '6m ago' };

const isOpen = (options: ContentPartsOptions, name: string): boolean => !options.folded.has(name);

const toggle =
  (options: ContentPartsOptions, name: string): ((cx: Context) => void) =>
  (cx) => {
    options.onToggle(name, cx);
  };

const checksSection = (stale: boolean, options: ContentPartsOptions): Element => {
  const testsAge = stale ? '8m ago' : '2m ago';
  const styleAge = stale ? '7m ago' : '1m ago';

  const rows = [
    statusRow(failingCheck(stale)),
    statusRow(runningCheck('tests', testsAge, stale)),
    statusRow(runningCheck('style', styleAge, stale)),
  ];

  const parts = stale ? [partNote(staleChecksNote), ...rows] : rows;

  const section: ContentSectionOptions = {
    name: 'Checks',
    count: 3,
    open: isOpen(options, 'Checks'),
    parts,
    onToggle: toggle(options, 'Checks'),
  };

  return contentSection(section);
};

const threadRow = (reference: string, detail: string): StatusRowOptions => ({
  mark: 'review',
  name: reference,
  detail,
  state: 'unresolved',
});

const threadsSection = (options: ContentPartsOptions): Element =>
  contentSection({
    name: 'Threads',
    count: 2,
    open: isOpen(options, 'Threads'),
    onToggle: toggle(options, 'Threads'),
    parts: [
      statusRow(threadRow('rows.ts:48', 'sqve · 2h ago')),
      statusRow(threadRow('repoLabel.ts:27–31', 'sqve · 1h ago')),
    ],
  });

const slicesSection = (options: ContentPartsOptions): Element =>
  contentSection({
    name: 'Slices',
    count: 3,
    open: isOpen(options, 'Slices'),
    onToggle: toggle(options, 'Slices'),
    parts: [
      statusRow({ mark: 'done', name: 'Read the ticket snapshot', state: 'done' }),
      statusRow({ mark: 'working', name: 'Draw the shared content frame', state: 'in progress' }),
      statusRow({ mark: 'idle', name: 'Check links and empty states', state: 'backlog' }),
    ],
  });

const uncountedSection = (options: ContentPartsOptions): Element =>
  contentSection({
    name: 'Slices',
    open: isOpen(options, 'Slices without a count'),
    onToggle: toggle(options, 'Slices without a count'),
    parts: [statusRow({ mark: 'done', name: 'Read the ticket snapshot', state: 'done' })],
  });

const fileRow = (path: string, counts: string): StatusRowOptions => ({
  mark: null,
  name: path,
  state: counts,
});

const filesSection = (options: ContentPartsOptions): Element =>
  contentSection({
    name: 'Files',
    count: 9,
    open: isOpen(options, 'Files'),
    onToggle: toggle(options, 'Files'),
    parts: [
      statusRow(fileRow('src/kit/sectionHeader.ts', '+18 −2')),
      statusRow(fileRow('src/kit/statusRow.ts', '+59 −0')),
    ],
  });

export const contentParts = (options: ContentPartsOptions): Element[] => [
  sample('Source links', sourceLinks()),
  sample('Pull request header', pullHeader()),
  sample(
    'Ticket header',
    ticketHeader({ kind: 'inProgress', label: 'In progress', age: '1m ago' }),
  ),
  sample('Loading ticket header', loadingHeader()),
  sample('Review header', reviewHeader({ kind: 'inReview', label: 'in review', age: null })),
  sample('Sent review header', reviewHeader({ kind: 'sent', label: 'sent', age: null })),
  sample('Ticket header without a state', ticketHeader(null)),
  sample('Long ticket title and facts, in a pane beside the agent', longTicket()),
  sample('Fact rows in a rail', rail()),
  sample('Review action', railFrame(readyAction())),
  sample('Failed save action', railFrame(failedSaveAction())),
  sample('Sent review action', railFrame(sentAction())),
  sample('Document with an edited line and commented lines', narrowFrame(documentLines())),
  sample('Checks section with live rows', narrowFrame(checksSection(false, options))),
  sample('Checks section with stale rows', narrowFrame(checksSection(true, options))),
  sample('Threads section', narrowFrame(threadsSection(options))),
  sample('Slices section', narrowFrame(slicesSection(options))),
  sample('Section without a count', narrowFrame(uncountedSection(options))),
  sample('Folded section', narrowFrame(filesSection(options))),
];
