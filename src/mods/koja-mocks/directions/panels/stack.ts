import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { dot, fixedLabel, label, row, statusMark } from '../parts.ts';
import { dimFact, joinedFacts, workNeedMark } from '../sidebars/facts.ts';
import { mergedProgress, sourceLink } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { diffCounts } from './changes.ts';
import type { FakePull } from './data.ts';
import { focusedSpace, stackPulls } from './data.ts';

export type PullLook = (pull: FakePull, tokens: DirectionTokens) => Element;

const leadingWidth = 14;
const numberWidth = 26;
const startGap = 6;
const factsHeight = 18;
const countGap = 4;
const staleDotSize = 6;

export const shownPulls = stackPulls.filter((pull) => pull.state !== 'merged');

const mergedPulls = stackPulls.filter((pull) => pull.state === 'merged');

const unknownPull: FakePull = {
  pull: 0,
  ticket: '',
  title: '',
  state: 'open',
  checkedOut: true,
};

export const checkedOutPull = stackPulls.find((pull) => pull.checkedOut) ?? unknownPull;

const leadingMark = (pull: FakePull, tokens: DirectionTokens): Element => {
  if (pull.checkedOut) {
    return h_flex()
      .w(leadingWidth)
      .flex_none()
      .items_center()
      .justify_center()
      .child(icon('git-branch', 'small').text_color(tokens.ink.muted));
  }

  return statusMark('idle', tokens).w(leadingWidth);
};

export const pullEnd = (pull: FakePull, tokens: DirectionTokens): Element[] => {
  if (pull.state === 'draft') {
    return [dimFact('draft', tokens)];
  }

  return pull.need === undefined ? [] : [workNeedMark(pull.need, tokens)];
};

export const pullNumber = (pull: FakePull, tokens: DirectionTokens): Element =>
  fixedLabel(`#${pull.pull}`, tokens.text.detail, tokens.ink.dim).w(numberWidth);

export const pullLineWith = (
  pull: FakePull,
  start: Element,
  selected: boolean,
  tokens: DirectionTokens,
): Element =>
  row(
    {
      selected,
      start,
      label: label(pull.title, tokens.text.body, tokens.ink.text),
      end: pullEnd(pull, tokens),
    },
    tokens,
  );

const markedStart = (pull: FakePull, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .gap(startGap)
    .items_center()
    .child(leadingMark(pull, tokens))
    .child(pullNumber(pull, tokens));

export const pullLine: PullLook = (pull, tokens) =>
  pullLineWith(pull, markedStart(pull, tokens), false, tokens);

// The stack map marks where the checked-out PR sits with the selected pill.
export const mapLine: PullLook = (pull, tokens) =>
  pullLineWith(pull, markedStart(pull, tokens), pull.checkedOut, tokens);

export const diffFact = (add: number, del: number, tokens: DirectionTokens): Element =>
  h_flex()
    .flex_none()
    .gap(countGap)
    .items_center()
    .children(diffCounts(add, del, tokens));

const pullFacts = (pull: FakePull, tokens: DirectionTokens): Element[] => {
  const facts = [dimFact(pull.ticket, tokens)];

  if (pull.checks !== undefined) {
    facts.push(dimFact(pull.checks, tokens));
  }

  if (pull.threads !== undefined) {
    facts.push(dimFact(`${pull.threads} threads`, tokens));
  }

  if (pull.diff !== undefined) {
    facts.push(diffFact(pull.diff.add, pull.diff.del, tokens));
  }

  return facts;
};

export const factsRow = (facts: Element[], tokens: DirectionTokens): Element =>
  h_flex()
    .h(factsHeight)
    .flex_none()
    .min_w(0)
    .mx(tokens.rows.inset)
    .px(tokens.rows.paddingX)
    .items_center()
    .child(joinedFacts(facts, tokens));

export const pullFactsRow = (pull: FakePull, tokens: DirectionTokens): Element =>
  factsRow(pullFacts(pull, tokens), tokens);

// Running checks get a mark like the other needs.
// A stack read minutes ago shows the checks as they were, with a still dim mark, never a spinner.
const checksMark = (stale: boolean, tokens: DirectionTokens): Element => {
  if (!stale) {
    return statusMark('working', tokens).w(leadingWidth);
  }

  return h_flex()
    .w(leadingWidth)
    .flex_none()
    .items_center()
    .justify_center()
    .child(dot(staleDotSize, tokens.ink.dim));
};

const checksFact = (checks: string, stale: boolean, tokens: DirectionTokens): Element => {
  const fact = dimFact(checks, tokens);

  if (!checks.endsWith('running')) {
    return fact;
  }

  return h_flex()
    .flex_none()
    .gap(countGap)
    .items_center()
    .child(checksMark(stale, tokens))
    .child(fact);
};

// The checked-out PR's facts keep the 24 px row rhythm, and its ticket is a link as in the sidebar.
// It has no diff totals: the changes below it count only uncommitted files.
export const checkedOutFactsRow = (
  pull: FakePull,
  stale: boolean,
  tokens: DirectionTokens,
): Element => {
  const facts = [sourceLink(pull.ticket, tokens)];

  if (pull.checks !== undefined) {
    facts.push(checksFact(pull.checks, stale, tokens));
  }

  if (pull.threads !== undefined) {
    facts.push(dimFact(`${pull.threads} threads`, tokens));
  }

  return factsRow(facts, tokens).h(tokens.rows.height);
};

// From the row's own edge to its title, past the leading mark and the number column.
export const titleStart = leadingWidth + numberWidth + startGap * 2;

export const markCenter = leadingWidth / 2;

export const numberColumn = numberWidth + startGap;

// The second line starts under the title.
export const factsLine = (pull: FakePull, tokens: DirectionTokens): Element =>
  pullFactsRow(pull, tokens).pl(tokens.rows.paddingX + titleStart);

export const twoLinePull: PullLook = (pull, tokens) => {
  if (pull.state === 'draft') {
    return pullLine(pull, tokens);
  }

  return v_flex().flex_none().child(pullLine(pull, tokens)).child(factsLine(pull, tokens));
};

export const mergedTextOf = (merged: FakePull[], tokens: DirectionTokens): Element => {
  const numbers = merged
    .map((pull) => pull.pull)
    .toSorted((first, second) => first - second)
    .map((pull) => `#${pull}`)
    .join(' ');

  return h_flex()
    .min_w(0)
    .gap(startGap)
    .items_center()
    .child(fixedLabel(`${merged.length} merged`, tokens.text.body, tokens.ink.muted))
    .child(dimFact(numbers, tokens));
};

export const mergedFold = (tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: statusMark('done', tokens).w(leadingWidth),
      label: mergedTextOf(mergedPulls, tokens),
      end: [],
    },
    tokens,
  );

export const stackList = (look: PullLook, tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.gap)
    .children(shownPulls.map((pull) => look(pull, tokens)))
    .child(mergedFold(tokens));

export const stackFacts = (tokens: DirectionTokens): Element[] => [
  mergedProgress(focusedSpace, tokens),
];

// A failing PR must stay visible while the stack is hidden.
export const stackAlerts = (tokens: DirectionTokens): Element[] => {
  const failing = shownPulls.some((pull) => pull.need === 'failing');

  return failing ? [workNeedMark('failing', tokens)] : [];
};
