import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { IconName } from '../../../../kit/index.ts';
import { icon } from '../../../../kit/index.ts';
import { fixedLabel, label } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { directionWindow } from '../window.ts';
import type { FakeSpace } from './content.ts';
import { fakeProjects } from './content.ts';
import { dimFact, rowLine, sidebarGroup, titleLabel } from './facts.ts';

interface StateProject {
  name: string;
  folded: boolean;
  hidden: number;
  readError?: string;
  spaces: FakeSpace[];
}

interface StateMachine {
  name: string;
  icon: IconName;
  remote: boolean;
  projects: StateProject[];
}

const headerGap = 6;
const pillHeight = 20;
const pillPadding = 8;

const spacesOf = (name: string): FakeSpace[] =>
  fakeProjects.find((project) => project.name === name)?.spaces ?? [];

const isRemote = (machine: StateMachine): boolean => machine.remote;

const needsUser = (space: FakeSpace): boolean =>
  space.agent === 'blocked' || space.need !== undefined;

const machines: StateMachine[] = [
  {
    name: 'This computer',
    icon: 'monitor',
    remote: false,
    projects: [
      { name: 'koja', folded: false, hidden: 0, spaces: spacesOf('koja') },
      {
        name: 'tau',
        folded: true,
        hidden: 2,
        spaces: spacesOf('tau').filter(needsUser),
      },
      {
        name: 'tikk',
        folded: false,
        hidden: 0,
        readError: 'Could not read PRs',
        spaces: spacesOf('tikk'),
      },
    ],
  },
  {
    name: 'build-box',
    icon: 'server',
    remote: true,
    projects: [
      {
        name: 'herdr-app',
        folded: false,
        hidden: 0,
        spaces: [
          {
            title: 'Pane equalize',
            pull: 540,
            agent: 'working',
            selected: false,
            age: '1m',
          },
          {
            title: 'Swap pane by target',
            pull: 542,
            agent: 'done',
            need: 'review',
            selected: false,
            age: '9m',
          },
        ],
      },
    ],
  },
];

const headerLine = (tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .h(tokens.rows.height)
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .gap(headerGap)
    .items_center();

// A folded project keeps its spaces that need the user and counts the rest.
const projectHeader = (project: StateProject, tokens: DirectionTokens): Element => {
  const header = headerLine(tokens).child(
    fixedLabel(project.name, tokens.text.heading, tokens.ink.text),
  );

  if (!project.folded) {
    return header;
  }

  return header
    .child(icon('chevron-right', 'small').text_color(tokens.ink.dim))
    .child(h_flex().flex_1())
    .child(dimFact(`${project.hidden} more`, tokens));
};

const retryPill = (tokens: DirectionTokens): Element =>
  h_flex()
    .h(pillHeight)
    .px(pillPadding)
    .flex_none()
    .items_center()
    .rounded(tokens.controls.radius)
    .border(1)
    .border_color(tokens.pane.border)
    .child(fixedLabel('Retry', tokens.text.detail, tokens.ink.muted));

// A failed read says so once, under the project, and offers Retry; rows keep their last facts.
const errorLine = (text: string, tokens: DirectionTokens): Element =>
  headerLine(tokens)
    .child(icon('circle-alert', 'small').text_color(tokens.marks.blocked))
    .child(label(text, tokens.text.detail, tokens.ink.muted).flex_1())
    .child(retryPill(tokens));

const spaceRow = (space: FakeSpace, tokens: DirectionTokens): Element =>
  rowLine(
    {
      space,
      middle: [titleLabel(space, tokens)],
      trailing: [],
      hovered: false,
      progress: true,
    },
    tokens,
  );

const projectBlock = (project: StateProject, tokens: DirectionTokens): Element => {
  const rows: Element[] = [];

  if (project.readError !== undefined) {
    rows.push(errorLine(project.readError, tokens));
  }

  rows.push(...project.spaces.map((space) => spaceRow(space, tokens)));

  return sidebarGroup(projectHeader(project, tokens), rows);
};

const localProjects = (): StateProject[] =>
  machines.filter((machine) => !isRemote(machine)).flatMap((machine) => machine.projects);

const remoteMachines = (): StateMachine[] => machines.filter(isRemote);

const listFrame = (tokens: DirectionTokens): Element =>
  v_flex()
    .w(tokens.areas.sidebarWidth)
    .flex_none()
    .h_full()
    .min_h(0)
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.groupGap)
    .bg(tokens.areas.frame);

const remoteTag = (machine: StateMachine, tokens: DirectionTokens): Element[] => [
  icon(machine.icon, 'small').text_color(tokens.ink.dim),
  dimFact(machine.name, tokens),
];

const taggedBlock = (
  project: StateProject,
  machine: StateMachine,
  tokens: DirectionTokens,
): Element => {
  const header = projectHeader(project, tokens).children(remoteTag(machine, tokens));

  return sidebarGroup(
    header,
    project.spaces.map((space) => spaceRow(space, tokens)),
  );
};

const tagSidebar = (tokens: DirectionTokens): Element =>
  listFrame(tokens)
    .children(localProjects().map((project) => projectBlock(project, tokens)))
    .children(
      remoteMachines().flatMap((machine) =>
        machine.projects.map((project) => taggedBlock(project, machine, tokens)),
      ),
    );

export const machineTagScene = (tokens: DirectionTokens): Element =>
  directionWindow(tokens, tagSidebar);
