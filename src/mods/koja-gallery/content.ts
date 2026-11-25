import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { Fact, SourceLinkOptions } from '../../kit/index.ts';
import {
  contentSize,
  factPairs,
  factRows,
  itemHeader,
  sourceLink,
  spacing,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

const ticketFacts: Fact[] = [
  { label: 'Project', value: 'Koja' },
  { label: 'Parent', value: 'ME-1087', link: { source: 'Linear' } },
  { label: 'Related PR', value: '#52', link: { source: 'GitHub', repository: 'koja' } },
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
  { label: 'Related PRs', value: '#52', link: { source: 'GitHub', repository: 'koja' } },
  { label: '', value: '#57', link: { source: 'GitHub', repository: 'koja' } },
  { label: '', value: '#63', link: { source: 'GitHub', repository: 'koja' } },
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

const ticketHeader = (): Element =>
  itemHeader({
    kind: 'ready',
    identifier: 'ME-1094',
    source: 'Linear',
    title: 'Design the ticket view',
    state: { kind: 'inProgress', label: 'In progress', age: '1m ago' },
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

export const contentParts = (): Element[] => [
  sample('Source links', sourceLinks()),
  sample('Pull request header', pullHeader()),
  sample('Ticket header', ticketHeader()),
  sample('Loading ticket header', loadingHeader()),
  sample('Long ticket title and facts, in a pane beside the agent', longTicket()),
  sample('Fact rows in a rail', rail()),
];
