import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { Fact, ItemHeaderOptions, SourceLinkOptions } from '../../kit/index.ts';
import {
  actionBlock,
  contentSize,
  documentLine,
  factPairs,
  factRows,
  itemHeader,
  sourceLink,
  spacing,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

type HeaderState = Extract<ItemHeaderOptions, { kind: 'ready' }>['state'];

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

const rail = (): Element => {
  const rows = factRows(ticketFacts);

  return v_flex().w(contentSize.railWidth).child(rows);
};

const railFrame = (content: Element): Element =>
  v_flex().w(contentSize.railWidth).p(spacing.xxlarge).child(content);

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

export const contentParts = (): Element[] => [
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
];
