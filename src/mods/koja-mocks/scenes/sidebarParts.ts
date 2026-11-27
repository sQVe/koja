import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { StackCardModel, StackCardPull } from '../../../kit/index.ts';
import {
  colors,
  emptyWorkSlot,
  linkText,
  listRow,
  projectHeader,
  rowHeight,
  sidebarSize,
  spaceFooter,
  spaceMark,
  spacing,
  stackCard,
  stackCardHeight,
  stackProgress,
  viewSwitch,
  workIcon,
} from '../../../kit/index.ts';
import type { FakeLayer, FakeProject, FakeSpace, RowLook } from './sidebarPartsData.ts';
import { fakeProjects, hoveredProject, selectedLinks, stackLayers } from './sidebarPartsData.ts';

const views = [
  { id: 'projects', label: 'Projects' },
  { id: 'inbox', label: 'Inbox' },
];

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

const pullEnd = (layer: FakeLayer): StackCardPull['end'] => {
  if (layer.need !== undefined) {
    return layer.need;
  }

  return layer.state === 'draft' ? 'draft' : null;
};

const stackCardModel = (space: FakeSpace): StackCardModel => {
  const merged = stackLayers.filter((layer) => layer.state === 'merged');
  const pulls = stackLayers.filter((layer) => layer.state !== 'merged');

  return {
    title: space.title,
    project: hoveredProject,
    merged: merged.map((layer) => layer.pull),
    pulls: pulls.map((layer) => ({
      number: layer.pull,
      ticket: layer.ticket,
      title: layer.title,
      checkedOut: layer.state === 'checkedOut',
      end: pullEnd(layer),
    })),
    total: stackLayers.length,
  };
};

const stackCardOf = (space: FakeSpace): Element => {
  const model = stackCardModel(space);

  return div()
    .absolute()
    .left(sidebarSize.width - spacing.xxsmall)
    .top(hoveredRowCenter() - stackCardHeight(model) / 2)
    .child(stackCard(model));
};

export const sidebarPartsScene = (): Element => {
  const cards = spacesWithLook('hovered').map((space) => stackCardOf(space));

  return div().relative().flex_1().min_h(0).bg(colors().chrome).child(sidebar()).children(cards);
};
