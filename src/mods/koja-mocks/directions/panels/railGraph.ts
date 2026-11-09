import { h_flex, v_flex } from 'gpui-base';
import type { Color, Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { fixedLabel, label, row } from '../parts.ts';
import { dimFact } from '../sidebars/facts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { FakePull } from './data.ts';
import type { RailState } from './railData.ts';
import {
  checkedOutFactsRow,
  diffFact,
  factsRow,
  mergedTextOf,
  numberColumn,
  pullFactsRow,
  pullEnd,
  pullLineWith,
  pullNumber,
} from './stack.ts';

export type HangingWork = (state: RailState, tokens: DirectionTokens) => Element[];

interface RailLook {
  hung: Element[];
  spaceLook: boolean;
  stale: boolean;
}

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

const hangingBlock = (facts: Element, hung: Element[], tokens: DirectionTokens): Element =>
  railRow(lineCell(tokens), v_flex().flex_none().pl(numberColumn).child(facts).children(hung));

const markedPullLine = (pull: FakePull, tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: pullNumber(pull, tokens),
      label: label(pull.title, tokens.text.body, tokens.ink.text),
      end: [...(pull.checkedOut ? [dimFact('checked out', tokens)] : []), ...pullEnd(pull, tokens)],
    },
    tokens,
  );

const pullLineOf = (pull: FakePull, spaceLook: boolean, tokens: DirectionTokens): Element =>
  spaceLook
    ? markedPullLine(pull, tokens)
    : pullLineWith(pull, pullNumber(pull, tokens), false, tokens);

const railPull = (
  pull: FakePull,
  top: boolean,
  look: RailLook,
  tokens: DirectionTokens,
): Element[] => {
  const cell = railCell({ top, node: pullNode(pull, tokens), bottom: true }, tokens);
  const line = railRow(cell, pullLineOf(pull, look.spaceLook, tokens));

  if (!pull.checkedOut) {
    return [line];
  }

  const facts = look.spaceLook
    ? checkedOutFactsRow(pull, look.stale, tokens)
    : pullFactsRow(pull, tokens);

  return [line, hangingBlock(facts, look.hung, tokens)];
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

// The space panel starts main's text in the PR title column, past an empty number column.
const trunkStart = (spaceLook: boolean, tokens: DirectionTokens): Element => {
  const name = fixedLabel('main', tokens.text.body, tokens.ink.text);

  if (!spaceLook) {
    return name;
  }

  return h_flex().flex_none().pl(numberColumn).items_center().child(name);
};

const trunkRow = (state: RailState, spaceLook: boolean, tokens: DirectionTokens): Element => {
  const node = circle(nodeSize).bg(tokens.marks.done);
  const cell = railCell({ top: true, node, bottom: false }, tokens);
  const merged = state.pulls.filter((pull) => pull.state === 'merged');
  const mergedFacts = merged.length === 0 ? h_flex() : mergedTextOf(merged, tokens);

  const trunk = row(
    {
      selected: false,
      start: trunkStart(spaceLook, tokens),
      label: mergedFacts,
      end: [],
    },
    tokens,
  );

  return railRow(cell, trunk);
};

export const railListOf = (
  state: RailState,
  hang: HangingWork,
  spaceLook: boolean,
  tokens: DirectionTokens,
): Element => {
  const shown = state.pulls.filter((pull) => pull.state !== 'merged');
  const look = { hung: hang(state, tokens), spaceLook, stale: state.readFailed !== undefined };
  const head = branchHead(state, look.hung, tokens);

  const pulls = shown.flatMap((pull, index) => {
    const top = head.length > 0 || index > 0;

    return railPull(pull, top, look, tokens);
  });

  return v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .children(head)
    .children(pulls)
    .child(trunkRow(state, spaceLook, tokens));
};

export const railList = (state: RailState, hang: HangingWork, tokens: DirectionTokens): Element =>
  railListOf(state, hang, false, tokens);
