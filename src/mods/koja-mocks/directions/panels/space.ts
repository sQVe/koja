import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { DirectionTokens } from '../tokens.ts';
import { fileTree } from './data.ts';
import { fileFacts, fileList } from './files.ts';
import { panelCard, panelWidth, sectionDivider, sectionHeader } from './frame.ts';
import type { StateCard } from './rail.ts';
import { readFailure, shownFileCount, shownFiles, stateScene } from './rail.ts';
import type { RailState } from './railData.ts';
import { twoStackBody } from './split.ts';
import { namedHeader, section, stackSectionHeader, workersSectionHeader } from './splitParts.ts';
import { workerListOf } from './workers.ts';

export type SpaceView = 'stack' | 'files';

const shownStackRows = 6;
// Stack gives up height long before Workers does; Workers shrinks only once Stack is at its floor.
const stackYield = 1;
const workersYield = 0.001;
const blockRowsWithSwitch = 3;
const blockRowsWithoutSwitch = 2;

// The section header plus six rows, so the stack never shrinks to nothing.
const stackFloor = (tokens: DirectionTokens): number => {
  const { rows } = tokens;

  return rows.listPadding * 2 + rows.height * (shownStackRows + 1);
};

const stackHeading = (view: SpaceView, state: RailState, tokens: DirectionTokens): Element =>
  view === 'files'
    ? sectionHeader({ name: 'Files', open: true, detail: fileFacts(tokens), end: [] }, tokens)
    : stackSectionHeader(state, tokens);

const stackBody = (view: SpaceView, state: RailState, tokens: DirectionTokens): Element =>
  view === 'files' ? fileList(tokens) : twoStackBody(state, tokens);

// Rows the stack draws at its natural height: PR rows, the trunk, and the checked-out block with
// its facts, Changes label, switch, and files.
const stackRowCount = (view: SpaceView, state: RailState): number => {
  if (view === 'files') {
    return fileTree.length;
  }

  const pullRows = state.pulls.filter((pull) => pull.state !== 'merged').length + 1;
  const blockRows = state.changes.hasBase ? blockRowsWithSwitch : blockRowsWithoutSwitch;
  const files = Math.min(shownFiles(state).length + 1, shownFileCount(state));

  return pullRows + blockRows + files;
};

// Natural height when it fits; past that the list scrolls under its fixed header. A stack shorter
// than the floor keeps its natural height, so Workers sits right under it.
const stackSection = (view: SpaceView, state: RailState, tokens: DirectionTokens): Element => {
  const region = v_flex()
    .min_h(0)
    .flex_shrink_1()
    .overflow_hidden()
    .child(stackBody(view, state, tokens));

  const stack = section([stackHeading(view, state, tokens), region], tokens)
    .flex_shrink(stackYield)
    .overflow_hidden();

  return stackRowCount(view, state) > shownStackRows ? stack.min_h(stackFloor(tokens)) : stack;
};

// The section hides when the space has no workers.
const workersSection = (state: RailState, tokens: DirectionTokens): Element[] => {
  if (state.workers.length === 0) {
    return [];
  }

  const list = v_flex()
    .min_h(0)
    .overflow_hidden()
    .child(workerListOf(state.workers, true, tokens));

  return [
    sectionDivider(tokens),
    section([workersSectionHeader(state, tokens), list], tokens)
      .flex_shrink(workersYield)
      .overflow_hidden(),
  ];
};

const spaceCard =
  (view: SpaceView): StateCard =>
  (state, tokens) =>
    panelCard(
      [
        namedHeader('Space', view === 'files', tokens),
        ...readFailure(state, tokens),
        stackSection(view, state, tokens),
        ...workersSection(state, tokens),
      ],
      panelWidth,
      tokens,
    );

export const spaceScene = (view: SpaceView, state: RailState, tokens: DirectionTokens): Element =>
  stateScene(state, spaceCard(view), tokens);
