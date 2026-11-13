import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import type { Status } from 'herdr';

import {
  colors,
  detailText,
  emptyWorkSlot,
  icon,
  iconSlot,
  listRow,
  roleText,
  rowHeight,
  sidebarSize,
  spaceMark,
  spacing,
  stackProgress,
  statusMark,
  viewSwitch,
  workIcon,
} from '../../../kit/index.ts';
import type { MarkProject, MarkSpace } from './headerMarksData.ts';
import { markProjects } from './headerMarksData.ts';

// Where a project header draws its main space's agent mark.
export type HeaderMarkVariant = 'name' | 'right' | 'rightActive' | 'leftActive';

const views = [
  { id: 'projects', label: 'Projects' },
  { id: 'inbox', label: 'Inbox' },
];

const needsAttention = (agent: Status | null): boolean =>
  agent === 'working' || agent === 'blocked' || agent === 'done';

const ageParts = (age: string | undefined): Element[] =>
  age === undefined ? [] : [detailText(age)];

const spaceEnd = (space: MarkSpace): Element[] => {
  const end: Element[] = [];

  if (space.stack !== undefined) {
    end.push(stackProgress({ ...space.stack, label: 'count' }));
  }

  end.push(...ageParts(space.age));
  end.push(space.need === undefined ? emptyWorkSlot() : workIcon(space.need));

  return end;
};

const spaceRow = (space: MarkSpace): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    start: spaceMark(space.agent),
    label: space.title,
    end: spaceEnd(space),
  });

const machineParts = (project: MarkProject): Element[] =>
  project.machine === undefined
    ? []
    : [icon('server', 'small').text_color(colors().dim), roleText('detail', project.machine)];

const nameLabel = (project: MarkProject): Element =>
  h_flex()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(roleText('sectionHeading', project.name, 'foreground'))
    .children(machineParts(project));

// The chevron keeps its slot when hidden, so the age and mark do not shift on hover.
const foldSlot = (project: MarkProject): Element =>
  project.main.look === 'hovered'
    ? iconSlot(icon('chevron-down', 'small').text_color(colors().dim))
    : emptyWorkSlot();

// The right mark sits in the rows' work icon column, so ages line up down the list.
const showsRightMark = (variant: HeaderMarkVariant, agent: Status | null): boolean => {
  if (variant === 'right') {
    return true;
  }

  return variant === 'rightActive' && needsAttention(agent);
};

const rightMark = (project: MarkProject, variant: HeaderMarkVariant): Element => {
  const { agent } = project.main;

  return showsRightMark(variant, agent) ? spaceMark(agent) : emptyWorkSlot();
};

const leftMark = (project: MarkProject, variant: HeaderMarkVariant): Element | undefined => {
  if (variant !== 'leftActive') {
    return undefined;
  }

  const { agent } = project.main;

  return needsAttention(agent) ? spaceMark(agent) : statusMark(null);
};

const headerRow = (project: MarkProject, variant: HeaderMarkVariant): Element => {
  const start = leftMark(project, variant);

  return listRow({
    size: 'small',
    inset: true,
    state: project.main.look === 'selected' ? 'selected' : 'normal',
    hovered: project.main.look === 'hovered',
    ...(start === undefined ? {} : { start }),
    label: nameLabel(project),
    end: [foldSlot(project), ...ageParts(project.main.age), rightMark(project, variant)],
  });
};

const projectGroup = (project: MarkProject, variant: HeaderMarkVariant): Element =>
  v_flex()
    .flex_none()
    .gap(spacing.xxsmall)
    .child(headerRow(project, variant))
    .children(project.spaces.map((space) => spaceRow(space)));

const switchLine = (): Element =>
  h_flex()
    .h(rowHeight.small)
    .flex_none()
    .px(spacing.xsmall)
    .items_center()
    .child(viewSwitch({ options: views, active: 'projects', onSelect: () => undefined }));

export const headerMarksScene = (variant: HeaderMarkVariant): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .w(sidebarSize.width)
    .pt(spacing.small)
    .bg(colors().chrome)
    .child(switchLine())
    .child(
      v_flex()
        .flex_1()
        .min_h(0)
        .pt(sidebarSize.groupGap)
        .gap(sidebarSize.groupGap)
        .children(markProjects.map((project) => projectGroup(project, variant))),
    );
