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
  projectHeader,
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

const rowPitch = (): number => rowHeight.small + spacing.xxsmall;

const groupHeight = (project: FakeProject): number =>
  rowHeight.small + project.spaces.length * rowPitch();

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

const spaceEnd = (space: FakeSpace): Element[] => {
  const end: Element[] = [];

  if (space.stack !== undefined) {
    end.push(stackProgress({ ...space.stack, label: 'count' }));
  }

  const needSlot = space.need === undefined ? emptyWorkSlot() : workIcon(space.need);

  end.push(needSlot);

  return end;
};

const spaceRow = (space: FakeSpace): Element => {
  const state = space.look === 'selected' ? 'selected' : 'normal';

  return listRow({
    size: 'small',
    inset: true,
    state,
    hovered: space.look === 'hovered',
    start: spaceMark(space.agent),
    label: space.title,
    end: spaceEnd(space),
  });
};

const projectGroup = (project: FakeProject): Element =>
  v_flex()
    .flex_none()
    .gap(spacing.xxsmall)
    .child(
      projectHeader({
        kind: 'fold',
        name: project.name,
        folded: false,
        hidden: 0,
        hovered: false,
        onToggle: () => undefined,
      }),
    )
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

const sidebar = (): Element => {
  const groups = v_flex()
    .flex_1()
    .min_h(0)
    .pt(sidebarSize.groupGap)
    .gap(sidebarSize.groupGap)
    .children(fakeProjects.map((project) => projectGroup(project)));

  const footers = spacesWithLook('selected').map((space) => selectedFooter(space));

  return v_flex()
    .w(sidebarSize.width)
    .h_full()
    .flex_none()
    .pt(spacing.small)
    .pb(spacing.xsmall)
    .child(switchLine())
    .child(groups)
    .children(footers);
};

const cardLine = (start: Element, end: string): Element =>
  h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(start.flex_1())
    .child(roleText('detail', end));

const layerMark = (layer: FakeLayer): Element =>
  layer.state === 'checkedOut' ? icon('git-branch', 'small') : statusMark(null);

const layerEnd = (layer: FakeLayer): Element => {
  if (layer.need !== undefined) {
    return workIcon(layer.need);
  }

  return layer.state === 'draft' ? roleText('detail', 'draft') : emptyWorkSlot();
};

const layerLabel = (layer: FakeLayer): Element => {
  const pull = roleText('detail', pullLabel(layer.pull), 'muted').w(hoverCardSize.pullColumn);
  const ticket = roleText('detail', layer.ticket).w(hoverCardSize.ticketColumn);
  const title = div().flex_1().min_w(0).truncate().child(layer.title);

  return h_flex()
    .flex_1()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(pull)
    .child(ticket)
    .child(title);
};

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

const mergedRow = (merged: FakeLayer[]): Element => {
  const checkIcon = icon('check', 'small').text_color(colors().dim);
  const pulls = merged.map((layer) => pullLabel(layer.pull)).join(' · ');

  return listRow({
    size: 'small',
    inset: false,
    state: 'normal',
    start: checkIcon,
    label: roleText('detail', pulls, 'muted'),
    end: [roleText('detail', `${merged.length} merged`)],
  });
};

const stackCard = (hovered: FakeSpace): Element => {
  const merged = stackLayers.filter((layer) => layer.state === 'merged');
  const open = stackLayers.filter((layer) => layer.state !== 'merged');
  const arrowTop = hoverCardSize.headerCenter;

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

export const sidebarPartsScene = (): Element => {
  const cards = spacesWithLook('hovered').map((space) => stackCard(space));

  return div().relative().flex_1().min_h(0).bg(colors().chrome).child(sidebar()).children(cards);
};
