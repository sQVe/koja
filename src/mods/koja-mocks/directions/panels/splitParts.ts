import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { iconToggle } from '../parts.ts';
import { dimFact, questionMark, workNeedMark } from '../sidebars/facts.ts';
import { mergedProgress } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { panelHeader, panelTitle, sectionHeader } from './frame.ts';
import type { RailState } from './railData.ts';
import { askingCount } from './workers.ts';

const thumbWidth = 3;
const thumbInset = 2;
const markGap = 4;
const percent = 100;

// The panel keeps one name whatever it shows; the toggle swaps the stack for the file tree.
export const namedHeader = (
  name: string,
  detail: Element[],
  filesShown: boolean,
  tokens: DirectionTokens,
): Element =>
  panelHeader(
    [panelTitle(name, tokens), ...detail],
    [iconToggle('folder', filesShown, tokens)],
    tokens,
  );

const stackAlertsOf = (state: RailState, tokens: DirectionTokens): Element[] => {
  const failing = state.pulls.some((pull) => pull.need === 'failing');

  return failing ? [workNeedMark('failing', tokens)] : [];
};

const stackProgress = (state: RailState, tokens: DirectionTokens): Element[] =>
  state.space.stack === undefined ? [] : [mergedProgress(state.space, tokens)];

export const stackSectionHeader = (state: RailState, tokens: DirectionTokens): Element =>
  sectionHeader(
    {
      name: 'Stack',
      open: true,
      detail: stackProgress(state, tokens),
      end: stackAlertsOf(state, tokens),
    },
    tokens,
  );

// The question mark and its count stay in the header, so a folded or scrolled list still says a
// worker waits for the user.
const askingMarks = (state: RailState, tokens: DirectionTokens): Element[] => {
  const asking = askingCount(state.workers);

  if (asking === 0) {
    return [];
  }

  return [
    h_flex()
      .flex_none()
      .gap(markGap)
      .items_center()
      .child(questionMark(tokens))
      .child(dimFact(String(asking), tokens)),
  ];
};

// `extra` follows the worker count, such as the done workers a short panel leaves out.
export const workersSectionHeader = (
  state: RailState,
  extra: Element[],
  tokens: DirectionTokens,
): Element =>
  sectionHeader(
    {
      name: 'Workers',
      open: true,
      detail: [dimFact(String(state.workers.length), tokens), ...extra],
      end: askingMarks(state, tokens),
    },
    tokens,
  );

export const section = (parts: Element[], tokens: DirectionTokens): Element =>
  v_flex().min_h(0).pt(tokens.rows.listPadding).children(parts);

// A list cut at its own height; the thumb shows how much of it is in view.
export const scrollRegion = (
  content: Element,
  shownShare: number,
  tokens: DirectionTokens,
): Element => {
  const region = v_flex().relative().min_h(0).overflow_hidden().child(content);

  if (shownShare >= 1) {
    return region;
  }

  const thumb = div()
    .absolute()
    .top(thumbInset)
    .right(thumbInset)
    .w(thumbWidth)
    .h(`${Math.round(shownShare * percent)}%`)
    .rounded(thumbWidth / 2)
    .bg(tokens.rows.selectedFill);

  return region.child(thumb);
};
