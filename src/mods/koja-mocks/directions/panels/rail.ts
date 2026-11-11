import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import type { FakeChange } from '../../scenes/shellContent.ts';
import { iconToggle, label, row } from '../parts.ts';
import { mapSidebarOf, mergedProgress } from '../sidebars/sidebar.ts';
import { errorLine } from '../sidebars/states.ts';
import type { DirectionTokens } from '../tokens.ts';
import { directionWindow } from '../window.ts';
import { changeListOf, changeSwitchOf, moreRow } from './changes.ts';
import {
  groupLabel,
  oneCard,
  panelCard,
  panelColumn,
  panelHeader,
  panelTitle,
  panelWidth,
} from './frame.ts';
import type { RailState } from './railData.ts';
import { projectsWith } from './railData.ts';
import { railList } from './railGraph.ts';
import { workerListOf } from './workers.ts';

export type StateCard = (state: RailState, tokens: DirectionTokens) => Element;

const markWidth = 14;

export const stackHeader = (facts: Element[], tokens: DirectionTokens): Element =>
  panelHeader(
    [panelTitle('Stack', tokens), ...facts],
    [iconToggle('folder', false, tokens)],
    tokens,
  );

export const shownFileCount = (state: RailState): number =>
  state.changes.branchView ? state.changes.branchTotal : state.changes.uncommittedTotal;

export const shownFiles = (state: RailState): FakeChange[] =>
  state.changes.branchView ? state.changes.branch : state.changes.uncommitted;

export const changeScope = (state: RailState, tokens: DirectionTokens): Element[] => {
  const { changes } = state;

  if (!changes.hasBase) {
    return [];
  }

  const look = {
    uncommitted: changes.uncommittedTotal,
    branch: changes.branchTotal,
    branchActive: changes.branchView,
  };

  return [changeSwitchOf(look, tokens).mt(0)];
};

export const changeBody = (state: RailState, tokens: DirectionTokens): Element[] => {
  const files = shownFiles(state);
  const total = shownFileCount(state);
  const list = changeListOf(files, tokens);

  if (total > files.length) {
    list.child(moreRow(total - files.length, 'files', tokens));
  }

  return [...changeScope(state, tokens), list];
};

const fileGroup = (state: RailState, tokens: DirectionTokens): Element[] => [
  groupLabel('Changes', shownFileCount(state), tokens),
  ...changeBody(state, tokens),
];

const workerGroup = (state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.workers.length === 0) {
    return [];
  }

  return [
    groupLabel('Workers', state.workers.length, tokens),
    workerListOf(state.workers, true, tokens).pt(0),
  ];
};

export const workGroups = (state: RailState, tokens: DirectionTokens): Element[] => [
  ...fileGroup(state, tokens),
  ...workerGroup(state, tokens),
];

export const mainLine = (detail: Element[], tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: h_flex()
        .w(markWidth)
        .flex_none()
        .justify_center()
        .child(icon('git-branch', 'small').text_color(tokens.ink.muted)),
      label: label('main', tokens.text.body, tokens.ink.text),
      end: detail,
    },
    tokens,
  );

const mainList = (state: RailState, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .child(mainLine([], tokens))
    .children(workGroups(state, tokens));

const readFailure = (state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.readFailed === undefined) {
    return [];
  }

  return [
    errorLine(`Could not read PRs · ${state.readFailed}`, 'Retry', tokens).mt(
      tokens.rows.listPadding,
    ),
  ];
};

const railCard = (state: RailState, tokens: DirectionTokens): Element => {
  const list = state.onMain ? mainList(state, tokens) : railList(state, workGroups, tokens);
  const header = stackHeader([mergedProgress(state.space, tokens)], tokens);

  return panelCard(
    [header, ...readFailure(state, tokens), panelColumn([list])],
    panelWidth,
    tokens,
  );
};

export const stateScene = (
  state: RailState,
  drawCard: StateCard,
  tokens: DirectionTokens,
): Element =>
  directionWindow(
    tokens,
    (sidebarTokens) => mapSidebarOf(projectsWith(state.space), sidebarTokens),
    {
      ...oneCard((cardTokens) => drawCard(state, cardTokens)),
      ...(state.agent === undefined ? {} : { agent: state.agent }),
    },
  );

export const railScene = (state: RailState, tokens: DirectionTokens): Element =>
  stateScene(state, railCard, tokens);
