import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import type { WorkNeed } from '../../kit/index.ts';
import {
  emptyWorkSlot,
  factLine,
  hoverCard,
  hoverCardSize,
  linkText,
  listRow,
  overlaySize,
  projectHeader,
  roleText,
  sidebarSize,
  spaceFooter,
  spaceMark,
  spacing,
  stackProgress,
  viewSwitch,
  workIcon,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

interface HeaderLook {
  status?: Status;
  selected?: boolean;
  hovered?: boolean;
  folded?: boolean;
  age?: string;
}

interface SampleLayer {
  pull: number;
  title: string;
  need: WorkNeed | null;
}

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

const stackLayer = (layer: SampleLayer): Element => {
  const workSlot = layer.need === null ? emptyWorkSlot() : workIcon(layer.need);

  return listRow({
    size: 'small',
    inset: false,
    state: 'normal',
    label: `${pullLabel(layer.pull)} ${layer.title}`,
    end: [workSlot],
  });
};

const mainHeader = (name: string, look: HeaderLook): Element => {
  const folded = look.folded ?? false;
  const hidden = folded ? 2 : 0;

  return projectHeader({
    kind: 'space',
    name,
    folded,
    hidden,
    onToggle: () => undefined,
    status: look.status ?? 'idle',
    age: look.age ?? null,
    selected: look.selected ?? false,
    cursor: false,
    hovered: look.hovered ?? false,
    dragged: false,
  });
};

const projectsFrame = (headers: Element[]): Element =>
  v_flex().w(overlaySize.menuWidth).gap(sidebarSize.groupGap).children(headers);

export const sidebarParts = (): Element[] => {
  const workIcons = h_flex()
    .gap(spacing.medium)
    .items_center()
    .children(workNeeds.map((need) => workIcon(need)));

  const progressBars = h_flex()
    .gap(spacing.large)
    .items_center()
    .child(stackProgress({ merged: 3, total: 8, label: 'count' }))
    .child(stackProgress({ merged: 3, total: 8, label: 'merged' }))
    .child(stackProgress({ merged: 0, total: 0, label: 'count' }));

  const links = h_flex()
    .gap(spacing.medium)
    .child(linkText(sampleLink.ticket))
    .child(linkText(pullLabel(sampleLink.pull)));

  const longFactValue = 'me-1181-find-a-space-by-pr-ticket-or-branch-in-the-picker';

  const factLines = v_flex()
    .gap(spacing.medium)
    .child(factLine('add-search', ['PR 2 of 8', 'merged']))
    .child(factLine(longFactValue, ['PR 3 of 8', 'open']))
    .child(factLine('fix-crash', []));

  return [
    sample(
      'Project headers: idle main space, working and selected, hovered, folded, waiting with an age, remote without a main checkout, a group gap apart',
      projectsFrame([
        mainHeader('koja', {}),
        mainHeader('herdr', { selected: true, status: 'working' }),
        mainHeader('tikk', { hovered: true }),
        mainHeader('seam', { folded: true }),
        mainHeader('ruta', { folded: true, age: '4m', status: 'blocked' }),
        projectHeader({
          kind: 'fold',
          name: 'tau',
          machine: 'build-box',
          folded: false,
          hidden: 0,
          hovered: false,
          onToggle: () => undefined,
        }),
      ]),
    ),
    sample('Blocked space', spaceMark('blocked')),
    sample('Work icons: conflict, failing, review, restack, merge', workIcons),
    sample('Stack progress: count, merged, empty stack', progressBars),
    sample(
      'View switch with Projects active',
      viewSwitch({ options: views, active: 'projects', onSelect: () => undefined }),
    ),
    sample(
      'View switch with Inbox active',
      viewSwitch({ options: views, active: 'inbox', onSelect: () => undefined }),
    ),
    sample('Link text', links),
    sample(
      'Space rows: cursor with a need, selected, and a row with no need',
      partsFrame(spaceRows()),
    ),
    sample('Fact lines: a short value, a long cut value, and a row with no facts', factLines),
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
        arrowTop: hoverCardSize.headerCenter,
        header: cardLine(roleText('title', 'Tau workflow sidebar'), 'koja'),
        body: sampleLayers.map((layer) => stackLayer(layer)),
        footer: cardLine(roleText('detail', '8 PRs'), 'Open stack ›'),
      }),
    ),
  ];
};
