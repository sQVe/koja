import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import {
  colors,
  emptyWorkSlot,
  hoverCard,
  hoverCardSize,
  icon,
  linkText,
  listRow,
  roleText,
  rowHeight,
  sidebarSize,
  spaceFooter,
  spaceMark,
  spacing,
  stackProgress,
  statusMark,
  viewSwitch,
  workIcon,
} from '../../../kit/index.ts';
import type { FakeLayer, FakeSpace, FakeProject, RowLook } from './sidebarPartsData.ts';
import { fakeProjects, hoveredProject, selectedLinks, stackLayers } from './sidebarPartsData.ts';

const views = [
  { id: 'projects', label: 'Projects' },
  { id: 'inbox', label: 'Inbox' },
];

const pullLabel = (pull: number): string => `#${pull}`;

// The x offset of an inset row's content: its margin, its outline, and its padding.
const insetContent = (): number => spacing.xsmall + spacing.hairline + spacing.small;

const rowPitch = (): number => rowHeight.small + spacing.xxsmall;

const groupHeight = (project: FakeProject): number =>
  rowHeight.small + project.spaces.length * rowPitch();

// The y of the hovered row's center, from the sidebar's own layout: its top padding, the view
// switch line, then the groups above it.
const hoveredRowCenter = (): number => {
  let top = spacing.small + rowHeight.small;

  for (const project of fakeProjects) {
    top += sidebarSize.groupGap;

    const index = project.spaces.findIndex((space) => space.look === 'hovered');

    if (index !== -1) {
      return top + rowHeight.small + index * rowPitch() + spacing.xxsmall + rowHeight.small / 2;
    }

    top += groupHeight(project);
  }

  return top;
};

// The card's outline, its top padding, then half of the header line.
const cardTitleCenter = (): number => spacing.hairline + spacing.xsmall + rowHeight.small / 2;

const sidebarLine = (content: Element): Element =>
  h_flex().h(rowHeight.small).flex_none().min_w(0).px(insetContent()).items_center().child(content);

const spaceEnd = (space: FakeSpace): Element[] => {
  const end: Element[] = [];

  if (space.stack !== undefined) {
    end.push(stackProgress({ ...space.stack, label: 'count' }));
  }

  end.push(space.need === undefined ? emptyWorkSlot() : workIcon(space.need));

  return end;
};

const spaceRow = (space: FakeSpace): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: space.look === 'selected' ? 'selected' : 'normal',
    hovered: space.look === 'hovered',
    cursor: space.look === 'cursor',
    start: spaceMark(space.agent),
    label: space.title,
    end: spaceEnd(space),
  });

const projectGroup = (project: FakeProject): Element =>
  v_flex()
    .flex_none()
    .gap(spacing.xxsmall)
    .child(sidebarLine(roleText('sectionHeading', project.name, 'foreground')))
    .children(project.spaces.map((space) => spaceRow(space)));

// The switch's pill text lines up with the project names under it.
const switchLine = (): Element =>
  h_flex()
    .h(rowHeight.small)
    .flex_none()
    .px(spacing.xsmall)
    .items_center()
    .child(viewSwitch({ options: views, active: 'projects', onSelect: () => undefined }));

const spacesWithLook = (look: RowLook): FakeSpace[] =>
  fakeProjects.flatMap((project) => project.spaces).filter((space) => space.look === look);

const selectedFooter = (selected: FakeSpace): Element =>
  spaceFooter({
    title: selected.title,
    ...(selected.stack === undefined ? {} : { progress: selected.stack }),
    links: selectedLinks.map((link) => linkText(link)),
    end: linkText('Stack ›'),
  });

const sidebar = (): Element =>
  v_flex()
    .w(sidebarSize.width)
    .h_full()
    .flex_none()
    .pt(spacing.small)
    .pb(spacing.xsmall)
    .child(switchLine())
    .child(
      v_flex()
        .flex_1()
        .min_h(0)
        .pt(sidebarSize.groupGap)
        .gap(sidebarSize.groupGap)
        .children(fakeProjects.map((project) => projectGroup(project))),
    )
    .children(spacesWithLook('selected').map((space) => selectedFooter(space)));

const cardLine = (start: Element, end: string): Element =>
  h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(start.flex_1())
    .child(roleText('detail', end));

// A mark as wide as the icon, so the card's header text lines up with the marks under it.
const layerMark = (layer: FakeLayer): Element =>
  layer.state === 'checkedOut' ? icon('git-branch', 'small') : statusMark(null);

const layerEnd = (layer: FakeLayer): Element => {
  if (layer.need !== undefined) {
    return workIcon(layer.need);
  }

  return layer.state === 'draft' ? roleText('detail', 'draft') : emptyWorkSlot();
};

const layerLabel = (layer: FakeLayer): Element =>
  h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(roleText('detail', pullLabel(layer.pull), 'muted').w(hoverCardSize.pullColumn))
    .child(roleText('detail', layer.ticket).w(hoverCardSize.ticketColumn))
    .child(div().flex_1().min_w(0).truncate().child(layer.title));

const layerRow = (layer: FakeLayer): Element =>
  listRow({
    size: 'small',
    inset: false,
    state: 'normal',
    muted: layer.state === 'draft',
    start: layerMark(layer),
    label: layerLabel(layer),
    end: [layerEnd(layer)],
  });

const mergedRow = (merged: FakeLayer[]): Element =>
  listRow({
    size: 'small',
    inset: false,
    state: 'normal',
    start: icon('check', 'small').text_color(colors().dim),
    label: roleText('detail', merged.map((layer) => pullLabel(layer.pull)).join(' · '), 'muted'),
    end: [roleText('detail', `${merged.length} merged`)],
  });

const stackCard = (hovered: FakeSpace): Element => {
  const merged = stackLayers.filter((layer) => layer.state === 'merged');
  const open = stackLayers.filter((layer) => layer.state !== 'merged');
  const arrowTop = cardTitleCenter();

  return div()
    .absolute()
    .left(sidebarSize.width - spacing.xxsmall)
    .top(hoveredRowCenter() - arrowTop)
    .child(
      hoverCard({
        arrowTop,
        header: cardLine(roleText('title', hovered.title), hoveredProject),
        body: [mergedRow(merged), ...open.map((layer) => layerRow(layer))],
        footer: cardLine(roleText('detail', `${stackLayers.length} PRs`), 'Open stack ›'),
      }),
    );
};

export const sidebarPartsScene = (): Element =>
  div()
    .relative()
    .flex_1()
    .min_h(0)
    .bg(colors().chrome)
    .child(sidebar())
    .children(spacesWithLook('hovered').map((space) => stackCard(space)));
