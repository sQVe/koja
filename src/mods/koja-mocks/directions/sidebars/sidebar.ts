import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';

import { fixedLabel } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakeProject, FakeSpace } from './content.ts';
import { fakeProjects } from './content.ts';
import {
  dimFact,
  divider,
  groupHeader,
  joinedFacts,
  progressBar,
  rowLine,
  sidebarFrame,
  sidebarGroup,
  titleLabel,
} from './facts.ts';

interface PlacedSpace {
  space: FakeSpace;
  project: string;
}

interface InboxGroup {
  name: string;
  holds: (space: FakeSpace) => boolean;
}

const blockGap = 2;
const progressGap = 4;
const headerCountGap = 6;
const toggleHeight = 22;
const togglePadding = 8;

const allSpaces = (projects: FakeProject[]): PlacedSpace[] =>
  projects.flatMap((project) => project.spaces.map((space) => ({ space, project: project.name })));

const needsUser = (space: FakeSpace): boolean =>
  space.agent === 'blocked' || space.need !== undefined;

const mapRow = (space: FakeSpace, hovered: string | null, tokens: DirectionTokens): Element =>
  rowLine(
    {
      space,
      middle: [titleLabel(space, tokens)],
      trailing: [],
      hovered: space.title === hovered,
      progress: true,
    },
    tokens,
  );

const projectGroup = (
  project: FakeProject,
  hovered: string | null,
  tokens: DirectionTokens,
): Element =>
  sidebarGroup(
    groupHeader(project.name, tokens),
    project.spaces.map((space) => mapRow(space, hovered, tokens)),
  );

export const sourceLink = (text: string, tokens: DirectionTokens): Element =>
  fixedLabel(text, tokens.text.detail, tokens.ink.text).underline();

const blockLine = (start: Element, end: Element, tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.rows.height)
    .flex_none()
    .min_w(0)
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .gap(togglePadding)
    .items_center()
    .child(start)
    .child(h_flex().flex_1())
    .child(end);

const currentIds = (space: FakeSpace, tokens: DirectionTokens): Element[] => {
  const ids: Element[] = [];

  if (space.ticket !== undefined) {
    ids.push(sourceLink(space.ticket, tokens));
  }

  if (space.pull !== undefined) {
    ids.push(sourceLink(`#${space.pull}`, tokens));
  }

  return ids;
};

export const mergedProgress = (space: FakeSpace, tokens: DirectionTokens): Element => {
  if (space.stack === undefined) {
    return h_flex();
  }

  const { merged, total } = space.stack;

  return h_flex()
    .flex_none()
    .gap(progressGap)
    .items_center()
    .child(progressBar(merged, total, tokens))
    .child(dimFact(`${merged}/${total} merged`, tokens));
};

const currentBlock = (projects: FakeProject[], tokens: DirectionTokens): Element => {
  const selected = allSpaces(projects).find((placed) => placed.space.selected)?.space;

  if (selected === undefined) {
    return v_flex();
  }

  return v_flex()
    .flex_none()
    .gap(blockGap)
    .child(divider(tokens))
    .child(
      blockLine(
        fixedLabel(selected.title, tokens.text.title, tokens.ink.text),
        mergedProgress(selected, tokens),
        tokens,
      ),
    )
    .child(
      blockLine(
        joinedFacts(currentIds(selected, tokens), tokens),
        sourceLink('Stack ›', tokens),
        tokens,
      ),
    );
};

const mapList = (
  projects: FakeProject[],
  hovered: string | null,
  tokens: DirectionTokens,
): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .gap(tokens.rows.groupGap)
    .children(projects.map((project) => projectGroup(project, hovered, tokens)));

export const togglePillInk = (
  text: string,
  active: boolean,
  color: Color,
  tokens: DirectionTokens,
): Element => {
  const pill = h_flex()
    .h(toggleHeight)
    .px(togglePadding)
    .items_center()
    .rounded(tokens.controls.radius);

  if (active) {
    pill.bg(tokens.rows.selectedFill);
  }

  return pill.child(fixedLabel(text, tokens.text.detail, color));
};

export const togglePill = (text: string, active: boolean, tokens: DirectionTokens): Element =>
  togglePillInk(text, active, active ? tokens.ink.text : tokens.ink.muted, tokens);

// The view switch is the only line above the list; its pill text lines up with project names.
const viewBar = (inbox: boolean, tokens: DirectionTokens): Element =>
  h_flex()
    .h(tokens.rows.height)
    .flex_none()
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX - togglePadding)
    .gap(blockGap)
    .items_center()
    .child(togglePill('Projects', !inbox, tokens))
    .child(togglePill('Inbox', inbox, tokens));

// Projects in the user's order; rows never move because of status.
const mapSidebarWith = (
  projects: FakeProject[],
  hovered: string | null,
  tokens: DirectionTokens,
): Element =>
  sidebarFrame(tokens)
    .child(viewBar(false, tokens))
    .child(mapList(projects, hovered, tokens))
    .child(currentBlock(projects, tokens));

export const mapSidebarOf = (projects: FakeProject[], tokens: DirectionTokens): Element =>
  mapSidebarWith(projects, null, tokens);

export const mapSidebarHovering = (hovered: string | null, tokens: DirectionTokens): Element =>
  mapSidebarWith(fakeProjects, hovered, tokens);

export const mapSidebar = (tokens: DirectionTokens): Element => mapSidebarHovering(null, tokens);

const inboxGroups: InboxGroup[] = [
  { name: 'Agent asks', holds: (space) => space.agent === 'blocked' },
  {
    name: 'PR needs you',
    holds: (space) => space.agent !== 'blocked' && space.need !== undefined,
  },
  {
    name: 'Running',
    holds: (space) => !needsUser(space) && space.agent === 'working',
  },
  { name: 'Quiet', holds: (space) => !needsUser(space) && space.agent !== 'working' },
];

const inboxRow = (placed: PlacedSpace, tokens: DirectionTokens): Element =>
  rowLine(
    {
      space: placed.space,
      middle: [titleLabel(placed.space, tokens)],
      trailing: [dimFact(placed.project, tokens)],
      hovered: false,
      progress: true,
    },
    tokens,
  );

const inboxGroup = (group: InboxGroup, tokens: DirectionTokens): Element[] => {
  const members = allSpaces(fakeProjects).filter((placed) => group.holds(placed.space));

  if (members.length === 0) {
    return [];
  }

  return [
    sidebarGroup(
      groupHeader(group.name, tokens).child(
        dimFact(String(members.length), tokens).ml(headerCountGap),
      ),
      members.map((placed) => inboxRow(placed, tokens)),
    ),
  ];
};

export const inboxSidebar = (tokens: DirectionTokens): Element =>
  sidebarFrame(tokens)
    .child(viewBar(true, tokens))
    .child(
      v_flex()
        .flex_1()
        .min_h(0)
        .gap(tokens.rows.groupGap)
        .children(inboxGroups.flatMap((group) => inboxGroup(group, tokens))),
    )
    .child(currentBlock(fakeProjects, tokens));
