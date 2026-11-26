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

interface SectionLook {
  // The fold key, which every section states so two specimens with one label cannot share it.
  key: string;
  name: string;
  parts: Element[];
  count?: number;
}

export interface ContentPartsOptions {
  // Fold keys, which a section may not share with another that draws the same label.
  folded: ReadonlySet<string>;
  onToggle: (key: string, cx: Context) => void;
  // Shows the stale Checks sample with fresh rows, as a part that read again would.
  checksRetried: boolean;
  onRetryChecks: (cx: Context) => void;
}

// The gallery starts with this section folded, to show a folded header.
export const foldedSectionNames = ['Files'] as const;

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

const checksCount = 3;
const threadsCount = 2;
const slicesCount = 3;
const filesCount = 9;

const isOpen = (options: ContentPartsOptions, key: string): boolean => !options.folded.has(key);

const toggle =
  (options: ContentPartsOptions, key: string): ((cx: Context) => void) =>
  (cx) => {
    options.onToggle(key, cx);
  };

const sectionOptions = (options: ContentPartsOptions, look: SectionLook): ContentSectionOptions => {
  const section: ContentSectionOptions = {
    name: look.name,
    open: isOpen(options, look.key),
    parts: look.parts,
    onToggle: toggle(options, look.key),
  };

  return look.count === undefined ? section : { ...section, count: look.count };
};

const checksSection = (stale: boolean, options: ContentPartsOptions): Element => {
  const showsStale = stale && !options.checksRetried;
  const testsAge = showsStale ? '8m ago' : '2m ago';
  const styleAge = showsStale ? '7m ago' : '1m ago';

  const rows = [
    statusRow(failingCheck(showsStale)),
    statusRow(runningCheck('tests', testsAge, showsStale)),
    statusRow(runningCheck('style', styleAge, showsStale)),
  ];

  const parts = showsStale
    ? [partNote({ ...staleChecksNote, onRetry: options.onRetryChecks }), ...rows]
    : rows;

  // Both Checks specimens show the same label, so each folds on its own key.
  const key = stale ? 'Checks with stale rows' : 'Checks with live rows';

  return contentSection(
    sectionOptions(options, { key, name: 'Checks', parts, count: checksCount }),
  );
};

const threadRow = (reference: string, detail: string): StatusRowOptions => ({
  mark: 'review',
  name: reference,
  detail,
  state: 'unresolved',
  stateTone: 'dim',
});

const threadsSection = (options: ContentPartsOptions): Element =>
  contentSection(
    sectionOptions(options, {
      key: 'Threads',
      name: 'Threads',
      parts: [
        statusRow(threadRow('rows.ts:48', 'sqve · 2h ago')),
        statusRow(threadRow('repoLabel.ts:27–31', 'sqve · 1h ago')),
      ],
      count: threadsCount,
    }),
  );

const slicesSection = (options: ContentPartsOptions): Element =>
  contentSection(
    sectionOptions(options, {
      key: 'Slices',
      name: 'Slices',
      count: slicesCount,
      parts: [
        statusRow({
          mark: 'done',
          name: 'Read the ticket snapshot',
          state: 'done',
          stateTone: 'dim',
        }),
        statusRow({
          mark: 'working',
          name: 'Draw the shared content frame',
          state: 'in progress',
          stateTone: 'dim',
        }),
        statusRow({
          mark: 'idle',
          name: 'Check links and empty states',
          state: 'backlog',
          stateTone: 'dim',
        }),
      ],
    }),
  );

const descriptionSection = (options: ContentPartsOptions): Element =>
  contentSection(
    sectionOptions(options, {
      key: 'Description',
      name: 'Description',
      parts: [
        statusRow({
          mark: null,
          name: 'Adds project groups, work-need marks, and a quieter selected row.',
        }),
      ],
    }),
  );

const fileRow = (path: string, counts: string): StatusRowOptions => ({
  mark: null,
  name: path,
  state: counts,
  stateTone: 'dim',
});

const filesSection = (options: ContentPartsOptions): Element =>
  contentSection(
    sectionOptions(options, {
      key: 'Files',
      name: 'Files',
      count: filesCount,
      parts: [
        statusRow(fileRow('src/kit/contentSection.ts', '+64 −0')),
        statusRow(fileRow('src/kit/partNote.ts', '+48 −0')),
        statusRow(fileRow('src/kit/sectionHeader.ts', '+18 −2')),
        statusRow(fileRow('src/kit/stateLine.ts', '+4 −6')),
        statusRow(fileRow('src/kit/statusMark.ts', '+3 −1')),
        statusRow(fileRow('src/kit/statusRow.ts', '+59 −0')),
        statusRow(fileRow('src/kit/workIcon.ts', '+12 −6')),
        statusRow(fileRow('src/mods/koja-gallery/content.ts', '+120 −30')),
        statusRow(fileRow('src/mods/koja-gallery/main.ts', '+18 −2')),
      ],
    }),
  );

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
  sample('Section without a count', narrowFrame(descriptionSection(options))),
  sample('Folded section', narrowFrame(filesSection(options))),
];
