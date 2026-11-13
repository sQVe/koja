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
export type HeaderMarkVariant = 'name' | 'right' | 'rightActive' | 'leftActive' | 'afterName';

// Nested spaces sit one level under their header; flat spaces line up with it.
export type SpaceLayout = 'nested' | 'flat';

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

// The variants that draw the mark beside the name share one header layout.
const marksNearName = (variant: HeaderMarkVariant): boolean =>
  variant === 'leftActive' || variant === 'afterName';

const spaceRow = (space: MarkSpace, nested: boolean): Element =>
  listRow({
    size: 'small',
    inset: true,
    state: 'normal',
    depth: nested ? 1 : 0,
    start: spaceMark(space.agent),
    label: space.title,
    end: spaceEnd(space),
  });

const mainAgent = (project: MarkProject): Status | null => project.main?.agent ?? null;

const activeMark = (project: MarkProject): Element[] => {
  const agent = mainAgent(project);

  return project.main !== null && needsAttention(agent) ? [spaceMark(agent)] : [];
};

const machineParts = (project: MarkProject): Element[] =>
  project.machine === undefined
    ? []
    : [icon('server', 'small').text_color(colors().dim), roleText('detail', project.machine)];

// A header that is not a space keeps the section heading's own tone.
const nameTone = (project: MarkProject, variant: HeaderMarkVariant): 'foreground' | 'muted' =>
  marksNearName(variant) && project.main === null ? 'muted' : 'foreground';

const nameLabel = (project: MarkProject, variant: HeaderMarkVariant): Element =>
  h_flex()
    .min_w(0)
    .gap(spacing.small)
    .items_center()
    .child(roleText('sectionHeading', project.name, nameTone(project, variant)))
    .children(variant === 'afterName' ? activeMark(project) : [])
    .children(machineParts(project));

const chevron = (name: 'chevron-down' | 'chevron-right'): Element =>
  iconSlot(icon(name, 'small').text_color(colors().dim));

// Both header kinds fold the same way. The chevron keeps its slot when hidden, so nothing shifts
// on hover.
const foldParts = (project: MarkProject): Element[] => {
  if (project.hidden > 0) {
    return [roleText('detail', `${project.hidden} more`), chevron('chevron-right')];
  }

  return [project.look === 'hovered' ? chevron('chevron-down') : emptyWorkSlot()];
};

// The right mark sits in the rows' work icon column, so ages line up down the list.
const showsRightMark = (project: MarkProject, variant: HeaderMarkVariant): boolean => {
  if (project.main === null) {
    return false;
  }

  if (variant === 'right') {
    return true;
  }

  return variant === 'rightActive' && needsAttention(project.main.agent);
};

const rightMark = (project: MarkProject, variant: HeaderMarkVariant): Element =>
  showsRightMark(project, variant) ? spaceMark(mainAgent(project)) : emptyWorkSlot();

// Every header reserves the slot, so names line up whether or not a mark shows.
const leftMark = (project: MarkProject, variant: HeaderMarkVariant): Element | undefined => {
  if (variant !== 'leftActive') {
    return undefined;
  }

  return activeMark(project)[0] ?? statusMark(null);
};

const hiddenParts = (project: MarkProject): Element[] =>
  project.hidden > 0 ? [roleText('detail', `${project.hidden} more`)] : [];

// These variants put the chevron in the rows' work icon column, so it keeps one place and
// the header's age lines up with the rows' ages.
const foldSlot = (project: MarkProject): Element => {
  if (project.hidden > 0) {
    return chevron('chevron-right');
  }

  return project.look === 'hovered' ? chevron('chevron-down') : emptyWorkSlot();
};

const headerEnd = (project: MarkProject, variant: HeaderMarkVariant): Element[] => {
  const age = ageParts(project.main?.age);

  if (marksNearName(variant)) {
    return [...hiddenParts(project), ...age, foldSlot(project)];
  }

  return [...foldParts(project), ...age, rightMark(project, variant)];
};

const headerRow = (project: MarkProject, variant: HeaderMarkVariant): Element => {
  const start = leftMark(project, variant);

  return listRow({
    size: 'small',
    inset: true,
    state: project.look === 'selected' ? 'selected' : 'normal',
    hovered: project.look === 'hovered',
    ...(start === undefined ? {} : { start }),
    label: nameLabel(project, variant),
    end: headerEnd(project, variant),
  });
};

const projectGroup = (
  project: MarkProject,
  variant: HeaderMarkVariant,
  layout: SpaceLayout,
): Element =>
  v_flex()
    .flex_none()
    .gap(spacing.xxsmall)
    .child(headerRow(project, variant))
    .children(project.spaces.map((space) => spaceRow(space, layout === 'nested')));

const switchLine = (): Element =>
  h_flex()
    .h(rowHeight.small)
    .flex_none()
    .px(spacing.xsmall)
    .items_center()
    .child(viewSwitch({ options: views, active: 'projects', onSelect: () => undefined }));

export const headerMarksScene = (variant: HeaderMarkVariant, layout: SpaceLayout): Element =>
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
        .children(markProjects.map((project) => projectGroup(project, variant, layout))),
    );
