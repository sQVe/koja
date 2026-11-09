import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { agentPane } from '../../scenes/shellContent.ts';
import { fixedLabel, label, row } from '../parts.ts';
import { dimFact } from '../sidebars/facts.ts';
import { togglePill } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { changeListOf } from './changes.ts';
import {
  panelCard,
  panelColumn,
  panelWidth,
  sectionDivider,
  sectionHeader,
  sectionHeaderOf,
} from './frame.ts';
import type { StateCard } from './rail.ts';
import {
  changeBody,
  changeScope,
  mainLine,
  shownFileCount,
  shownFiles,
  stateScene,
} from './rail.ts';
import type { RailState } from './railData.ts';
import type { HangingWork } from './railGraph.ts';
import { railList } from './railGraph.ts';
import {
  scrollRegion,
  section,
  stackSectionHeader,
  namedHeader,
  workersSectionHeader,
} from './splitParts.ts';
import { questionDetail, workerListOf, workerRowsOf } from './workers.ts';

export type SplitVariant = 'two' | 'three';

const workersShare = '40%';
const factsHeight = 18;
const stackRows = 6;
const fileRows = 8;
const fewestRows = 2;
const contextGap = 6;
const selectorGap = 2;

const listHeight = (shownRows: number, tokens: DirectionTokens): number =>
  shownRows * tokens.rows.height + tokens.rows.listPadding * 2;

const changesFold = (state: RailState, tokens: DirectionTokens): Element =>
  sectionHeader(
    {
      name: 'Changes',
      open: true,
      detail: [dimFact(String(shownFileCount(state)), tokens)],
      end: [],
    },
    tokens,
  );

// The checked-out node keeps its changes; its workers move to their own section.
const pullChanges: HangingWork = (state, tokens) => [
  changesFold(state, tokens),
  ...changeBody(state, tokens),
];

const twoStackBody = (state: RailState, tokens: DirectionTokens): Element => {
  if (!state.onMain) {
    return railList(state, pullChanges, tokens);
  }

  return v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .child(mainLine([], tokens))
    .children(pullChanges(state, tokens));
};

// Workers keep their natural height up to a share of the panel, then scroll inside.
const twoWorkers = (state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.workers.length === 0) {
    return [];
  }

  const list = v_flex()
    .min_h(0)
    .overflow_hidden()
    .child(workerListOf(state.workers, true, tokens));

  return [
    sectionDivider(tokens),
    section([workersSectionHeader(state, [], tokens), list], tokens)
      .flex_none()
      .max_h(workersShare)
      .overflow_hidden(),
  ];
};

const twoCard: StateCard = (state, tokens) =>
  panelCard(
    [
      namedHeader('Status', [], false, tokens),
      section(
        [stackSectionHeader(state, tokens), panelColumn([twoStackBody(state, tokens)])],
        tokens,
      ).flex_1(),
      ...twoWorkers(state, tokens),
    ],
    panelWidth,
    tokens,
  );

const contextRow = (state: RailState, tokens: DirectionTokens): Element => {
  const branch = state.agent?.branch ?? agentPane.branch ?? '';

  return h_flex()
    .h(tokens.rows.height)
    .flex_none()
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .gap(contextGap)
    .items_center()
    .child(icon('git-branch', 'small').text_color(tokens.ink.dim))
    .child(fixedLabel(branch, tokens.text.detail, tokens.ink.dim));
};

const shrinkingRegion = (
  content: Element,
  shownShare: number,
  maxHeight: number,
  tokens: DirectionTokens,
): Element =>
  scrollRegion(content, shownShare, tokens)
    .flex_shrink_1()
    .max_h(maxHeight)
    .min_h(listHeight(fewestRows, tokens));

const threeStack = (state: RailState, tokens: DirectionTokens): Element => {
  if (state.onMain) {
    const onMain = row(
      { selected: false, label: label('On main', tokens.text.body, tokens.ink.dim), end: [] },
      tokens,
    );

    return section([stackSectionHeader(state, tokens), onMain], tokens).pb(tokens.rows.listPadding);
  }

  const rows = state.pulls.filter((pull) => pull.state !== 'merged').length + 1;
  const graph = railList(state, () => [], tokens);
  const maxHeight = listHeight(stackRows, tokens) + factsHeight;
  const region = shrinkingRegion(graph, Math.min(1, stackRows / rows), maxHeight, tokens);

  return section([stackSectionHeader(state, tokens), region], tokens).flex_shrink_1();
};

// The selector names the list it shows; Files would replace only this list.
const changesSelector = (state: RailState, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .gap(selectorGap)
    .items_center()
    .child(togglePill(`Changes ${shownFileCount(state)}`, true, tokens))
    .child(togglePill('Files', false, tokens));

const threeChanges = (state: RailState, tokens: DirectionTokens): Element => {
  const header = sectionHeaderOf(
    changesSelector(state, tokens),
    { open: true, detail: [], end: [] },
    tokens,
  );

  const share = Math.min(1, fileRows / shownFileCount(state));
  const list = changeListOf(shownFiles(state), tokens);
  const region = shrinkingRegion(list, share, listHeight(fileRows, tokens), tokens);

  return section([header, ...changeScope(state, tokens), region], tokens).flex_shrink_1();
};

// The selected question is pinned under the list, so scrolling the rows never hides it. Stack and
// Changes shrink toward two rows before the workers list does.
const threeWorkers = (state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.workers.length === 0) {
    return [];
  }

  const rows = v_flex().flex_none().child(workerRowsOf(state.workers, tokens));

  const detail = questionDetail(state.workers, tokens);
  const pinned = detail.length === 0 ? [] : [sectionDivider(tokens), ...detail];

  return [
    sectionDivider(tokens),
    section([workersSectionHeader(state, [], tokens), rows, ...pinned], tokens).flex_none(),
  ];
};

const threeCard: StateCard = (state, tokens) =>
  panelCard(
    [
      namedHeader('Status', [], false, tokens),
      contextRow(state, tokens),
      sectionDivider(tokens),
      threeStack(state, tokens),
      sectionDivider(tokens),
      threeChanges(state, tokens),
      ...threeWorkers(state, tokens),
    ],
    panelWidth,
    tokens,
  );

const cards: Record<SplitVariant, StateCard> = { two: twoCard, three: threeCard };

export const splitScene = (
  variant: SplitVariant,
  state: RailState,
  tokens: DirectionTokens,
): Element => stateScene(state, cards[variant], tokens);
