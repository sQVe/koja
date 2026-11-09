import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { fixedLabel, label, row } from '../parts.ts';
import { dimFact } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakePull } from './data.ts';
import type { RailState } from './railData.ts';
import {
  diffFact,
  factsRow,
  mergedTextOf,
  numberColumn,
  pullFactsRow,
  pullLineWith,
  pullNumber,
} from './stack.ts';

// What hangs off the checked-out node below its facts line.
export type HangingWork = (state: RailState, tokens: DirectionTokens) => Element[];

interface RailNode {
  top: boolean;
  node: Element;
  bottom: boolean;
}

const railWidth = 16;
const railLeft = 4;
const nodeSize = 8;
const currentNodeSize = 10;

const circle = (size: number): Element =>
  div()
    .size(size)
    .rounded(size / 2)
    .flex_none();

const hollow = (color: Color): Element => circle(nodeSize).border(1).border_color(color);

const currentNode = (tokens: DirectionTokens): Element =>
  circle(currentNodeSize).bg(tokens.ink.text);

const pullNode = (pull: FakePull, tokens: DirectionTokens): Element => {
  if (pull.checkedOut) {
    return currentNode(tokens);
  }

  return pull.state === 'draft' ? hollow(tokens.pane.border) : hollow(tokens.ink.muted);
};

const railSegment = (shown: boolean, tokens: DirectionTokens): Element => {
  const segment = div().w(1).flex_1();

  return shown ? segment.bg(tokens.pane.border) : segment;
};

const railCell = (look: RailNode, tokens: DirectionTokens): Element =>
  v_flex()
    .w(railWidth)
    .flex_none()
    .items_center()
    .child(railSegment(look.top, tokens))
    .child(look.node)
    .child(railSegment(look.bottom, tokens));

const lineCell = (tokens: DirectionTokens): Element =>
  v_flex().w(railWidth).flex_none().items_center().child(railSegment(true, tokens));

const railRow = (cell: Element, content: Element): Element =>
  h_flex()
    .flex_none()
    .items_stretch()
    .pl(railLeft)
    .child(cell)
    .child(v_flex().flex_1().min_w(0).child(content));

// The checked-out work hangs off its node, and the rail keeps running beside it.
const hangingBlock = (facts: Element, hung: Element[], tokens: DirectionTokens): Element =>
  railRow(lineCell(tokens), v_flex().flex_none().pl(numberColumn).child(facts).children(hung));

const railPull = (
  pull: FakePull,
  top: boolean,
  hung: Element[],
  tokens: DirectionTokens,
): Element[] => {
  const cell = railCell({ top, node: pullNode(pull, tokens), bottom: true }, tokens);
  const line = railRow(cell, pullLineWith(pull, pullNumber(pull, tokens), false, tokens));

  if (!pull.checkedOut) {
    return [line];
  }

  return [line, hangingBlock(pullFactsRow(pull, tokens), hung, tokens)];
};

// A branch without a PR takes the PR's place: its name in the number and title columns.
const branchHead = (state: RailState, hung: Element[], tokens: DirectionTokens): Element[] => {
  if (state.branch === undefined) {
    return [];
  }

  const { branch } = state;
  const cell = railCell({ top: false, node: currentNode(tokens), bottom: true }, tokens);

  const line = row(
    {
      selected: false,
      label: label(branch.name, tokens.text.body, tokens.ink.text),
      end: [dimFact('No PR yet', tokens)],
    },
    tokens,
  );

  const facts = factsRow(
    [dimFact(`${branch.commits} commits`, tokens), diffFact(branch.add, branch.del, tokens)],
    tokens,
  );

  return [railRow(cell, line), hangingBlock(facts, hung, tokens)];
};

// Merged PRs sit on the trunk, where the rail ends.
const trunkRow = (state: RailState, tokens: DirectionTokens): Element => {
  const node = circle(nodeSize).bg(tokens.marks.done);
  const cell = railCell({ top: true, node, bottom: false }, tokens);
  const merged = state.pulls.filter((pull) => pull.state === 'merged');
  const mergedFacts = merged.length === 0 ? h_flex() : mergedTextOf(merged, tokens);

  const trunk = row(
    {
      selected: false,
      start: fixedLabel('main', tokens.text.body, tokens.ink.text),
      label: mergedFacts,
      end: [],
    },
    tokens,
  );

  return railRow(cell, trunk);
};

export const railList = (state: RailState, hang: HangingWork, tokens: DirectionTokens): Element => {
  const shown = state.pulls.filter((pull) => pull.state !== 'merged');
  const hung = hang(state, tokens);
  const head = branchHead(state, hung, tokens);

  const pulls = shown.flatMap((pull, index) => {
    const top = head.length > 0 || index > 0;

    return railPull(pull, top, hung, tokens);
  });

  return v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .children(head)
    .children(pulls)
    .child(trunkRow(state, tokens));
};
