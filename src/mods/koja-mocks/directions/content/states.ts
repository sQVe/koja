import type { ContentItem } from './data.ts';
import { contentItems } from './data.ts';

export type ContentState =
  | 'ready'
  | 'saving-failed'
  | 'sent'
  | 'checks-failed'
  | 'unreachable'
  | 'loading';

export interface ContentView {
  item: ContentItem;
  state: ContentState;
  wide: boolean;
  normal: boolean;
}

const review: ContentView = {
  item: contentItems.review,
  state: 'ready',
  wide: true,
  normal: false,
};

const pull: ContentView = { item: contentItems.pr, state: 'ready', wide: false, normal: false };

const ticket: ContentView = {
  item: contentItems.ticket,
  state: 'ready',
  wide: false,
  normal: false,
};

const openingItem = (item: ContentItem): ContentItem => ({
  ...item,
  title: null,
  state: null,
  tab: item.identifier,
  facts: [],
  description: [],
});

const longTicket: ContentItem = {
  ...contentItems.ticket,
  title:
    'Design the ticket view for long titles, related pull requests, and project context across several active development cycles',
  facts: [
    { name: 'Project', value: 'Koja' },
    {
      name: 'Parent',
      value:
        'ME-1087 · Build the developer cockpit for agents, tickets, GitHub work, and every active development session in one window',
      link: true,
    },
    { name: 'Labels', value: 'design · cockpit · accessibility' },
    { name: 'Assignee', value: 'You' },
    { name: 'Cycle', value: 'Cycle 12' },
    { name: 'Estimate', value: '5 points' },
    { name: 'Slices', value: '1 done · 1 in progress · 1 backlog' },
    { name: 'Related PRs', value: '#52', link: true },
    { name: '', value: '#57', link: true },
    { name: '', value: '#63', link: true },
  ],
};

export const contentViews = {
  review,
  'review-saving-failed': {
    ...review,
    state: 'saving-failed',
    item: {
      ...review.item,
      facts: review.item.facts.map((fact) =>
        fact.name === 'Saved' ? { name: 'Saved', value: 'last saved 1m ago' } : fact,
      ),
    },
  },
  'review-sent': {
    ...review,
    state: 'sent',
    item: {
      ...review.item,
      state: 'sent',
      facts: review.item.facts.map((fact) =>
        fact.name === 'Saved' ? { name: 'Sent', value: 'just now' } : fact,
      ),
    },
  },
  'review-narrow': { ...review, wide: false },
  pr: pull,
  'pr-checks-failed': {
    ...pull,
    state: 'checks-failed',
    item: {
      ...pull.item,
      facts: pull.item.facts.map((fact) =>
        fact.name === 'Checks' ? { name: 'Checks', value: 'last read 6m ago' } : fact,
      ),
    },
  },
  'pr-unreachable': { ...pull, state: 'unreachable', item: openingItem(pull.item) },
  'pr-normal': { ...pull, normal: true },
  ticket,
  'ticket-loading': { ...ticket, state: 'loading', item: openingItem(ticket.item) },
  'ticket-long': { ...ticket, item: longTicket },
} satisfies Record<string, ContentView>;

export type ContentSceneName = keyof typeof contentViews;
