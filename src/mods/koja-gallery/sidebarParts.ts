import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { WorkNeed } from '../../kit/index.ts';
import {
  emptyWorkSlot,
  hoverCard,
  linkText,
  listRow,
  overlaySize,
  roleText,
  rowHeight,
  spaceFooter,
  spaceMark,
  spacing,
  stackProgress,
  viewSwitch,
  workIcon,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

interface SampleLayer {
  pull: number;
  title: string;
  need: WorkNeed | null;
}

// The card's outline, its top padding, then half of the header line.
const headerCenter = spacing.hairline + spacing.xsmall + rowHeight.small / 2;

const sampleLayers: SampleLayer[] = [
  { pull: 504, title: 'Two-line rows', need: null },
  { pull: 507, title: 'Stack panel', need: 'merge' },
  { pull: 509, title: 'Narrow rail', need: 'review' },
];

const sampleLink = { ticket: 'ME-1175', pull: 504 } as const;

const pullLabel = (pull: number): string => `#${pull}`;

const workNeeds: WorkNeed[] = ['conflict', 'failing', 'review', 'restack', 'merge'];

const views = [
  { id: 'projects', label: 'Projects' },
  { id: 'inbox', label: 'Inbox' },
];

const partsFrame = (content: Element[]): Element =>
  v_flex().w(overlaySize.menuWidth).children(content);

const spaceRows = (): Element[] => [
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    cursor: true,
    start: spaceMark('working'),
    label: 'Tau workflow sidebar',
    end: [stackProgress({ merged: 3, total: 8, label: 'count' }), workIcon('merge')],
  }),
  listRow({
    size: 'small',
    inset: true,
    state: 'selected',
    start: spaceMark('idle'),
    label: 'Stack panel',
    end: [stackProgress({ merged: 5, total: 8, label: 'count' }), workIcon('review')],
  }),
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    start: spaceMark(null),
    label: 'Notes',
    end: [emptyWorkSlot()],
  }),
];

const cardLine = (start: Element, end: string): Element =>
  h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(start.flex_1())
    .child(roleText('detail', end));

const stackLayer = (layer: SampleLayer): Element =>
  listRow({
    size: 'small',
    inset: false,
    state: 'normal',
    label: `${pullLabel(layer.pull)} ${layer.title}`,
    end: [layer.need === null ? emptyWorkSlot() : workIcon(layer.need)],
  });

export const sidebarParts = (): Element[] => [
  sample(
    'Work icons: conflict, failing, review, restack, merge',
    h_flex()
      .gap(spacing.medium)
      .items_center()
      .children(workNeeds.map((need) => workIcon(need))),
  ),
  sample(
    'Stack progress: count, merged, empty stack',
    h_flex()
      .gap(spacing.large)
      .items_center()
      .child(stackProgress({ merged: 3, total: 8, label: 'count' }))
      .child(stackProgress({ merged: 3, total: 8, label: 'merged' }))
      .child(stackProgress({ merged: 0, total: 0, label: 'count' })),
  ),
  sample(
    'View switch with Projects active',
    viewSwitch({ options: views, active: 'projects', onSelect: () => undefined }),
  ),
  sample(
    'Link text',
    h_flex()
      .gap(spacing.medium)
      .child(linkText(sampleLink.ticket))
      .child(linkText(pullLabel(sampleLink.pull))),
  ),
  sample(
    'Space rows: cursor with a need, selected, and a row with no need',
    partsFrame(spaceRows()),
  ),
  sample(
    'Selected-space footer with a stack, then with none',
    partsFrame([
      spaceFooter({
        title: 'Tau workflow sidebar',
        progress: { merged: 3, total: 8 },
        links: [linkText(sampleLink.ticket), linkText(pullLabel(sampleLink.pull))],
        end: linkText('Stack ›'),
      }),
      spaceFooter({ title: 'Notes', links: [linkText('ME-1180')], end: linkText('Stack ›') }),
    ]),
  ),
  sample(
    'Hover card with its arrow on the header line',
    hoverCard({
      arrowTop: headerCenter,
      header: cardLine(roleText('title', 'Tau workflow sidebar'), 'koja'),
      body: sampleLayers.map((layer) => stackLayer(layer)),
      footer: cardLine(roleText('detail', '8 PRs'), 'Open stack ›'),
    }),
  ),
];
