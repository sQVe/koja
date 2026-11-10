import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { footerLine, iconMark, mainLeft, overlayCard } from '../overlays/parts.ts';
import { fixedLabel, iconButton, label } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { attentionWindow, focusedPaneWidth, hiddenAsks } from './data.ts';

type HiddenAsk = (typeof hiddenAsks)[number];

export interface MixState {
  asks: readonly HiddenAsk[];
  listOpen: boolean;
  dismissed: boolean;
}

const maximumCardWidth = 420;
const paneClearance = 16;
const cardPadding = 10;
const lineGap = 6;
const rowPadding = 8;
const textInset = 20;

export const createMixState = (asks: readonly HiddenAsk[] = hiddenAsks): MixState => ({
  asks,
  listOpen: false,
  dismissed: false,
});

const dismissControl = (state: MixState, tokens: DirectionTokens): Element =>
  iconButton('x', tokens, tokens.ink.dim)
    .id('attention-mix-dismiss')
    .accessibility_label('Dismiss attention')
    .cursor_pointer()
    .on_mouse_down('left', (_event, context) => {
      context.stop_propagation();
    })
    .on_click((_event, context) => {
      context.stop_propagation();
      state.dismissed = true;
      context.notify();
    });

const moreControl = (state: MixState, tokens: DirectionTokens): Element => {
  const remaining = `${state.asks.length - 1} more`;

  return h_flex()
    .id('attention-mix-more')
    .accessibility_label('Show all asks')
    .h(tokens.controls.size)
    .flex_none()
    .gap(2)
    .items_center()
    .cursor_pointer()
    .child(fixedLabel(remaining, tokens.text.detail, tokens.ink.dim))
    .child(iconMark('chevron-right', tokens.ink.dim))
    .on_mouse_down('left', (_event, context) => {
      context.stop_propagation();
    })
    .on_click((_event, context) => {
      context.stop_propagation();
      state.listOpen = true;
      context.notify();
    });
};

const askLine = (ask: HiddenAsk, state: MixState, tokens: DirectionTokens): Element => {
  const line = h_flex()
    .gap(lineGap)
    .items_center()
    .child(iconMark('message-circle-question', tokens.marks.blocked))
    .child(fixedLabel(`${ask.space}:`, tokens.text.title, tokens.ink.text))
    .child(label(ask.question, tokens.text.body, tokens.ink.text).flex_1())
    .child(fixedLabel(ask.project, tokens.text.detail, tokens.ink.dim));

  if (state.asks.length > 1) {
    line.child(moreControl(state, tokens));
  }

  return line.child(dismissControl(state, tokens));
};

const askRow = (ask: HiddenAsk, selected: boolean, tokens: DirectionTokens): Element => {
  const title = h_flex()
    .gap(lineGap)
    .items_center()
    .child(iconMark('message-circle-question', tokens.marks.blocked))
    .child(fixedLabel(ask.space, tokens.text.body, tokens.ink.text))
    .child(h_flex().flex_1())
    .child(fixedLabel(ask.project, tokens.text.detail, tokens.ink.dim));

  const row = v_flex()
    .flex_none()
    .px(rowPadding)
    .py(lineGap)
    .gap(2)
    .rounded(tokens.rows.radius)
    .child(title)
    .child(fixedLabel(ask.question, tokens.text.detail, tokens.ink.dim).ml(textInset));

  return selected ? row.bg(tokens.rows.selectedFill) : row;
};

const askList = (state: MixState, tokens: DirectionTokens): Element => {
  const titleText = `${state.asks.length} asks`;

  const title = h_flex()
    .h(tokens.rows.height)
    .px(rowPadding)
    .items_center()
    .child(fixedLabel(titleText, tokens.text.heading, tokens.ink.text))
    .child(h_flex().flex_1())
    .child(dismissControl(state, tokens));

  return v_flex()
    .gap(2)
    .child(title)
    .children(state.asks.map((ask, index) => askRow(ask, index === 0, tokens)));
};

const positionedCard = (tokens: DirectionTokens): Element => {
  const paneWidth = focusedPaneWidth(tokens);
  const width = Math.min(maximumCardWidth, paneWidth - 2 * paneClearance);
  const paneLeft = mainLeft + tokens.areas.contentPadding;
  const left = paneLeft + (paneWidth - width) / 2;
  const bottom = tokens.areas.contentPadding + paneClearance;

  return overlayCard(tokens)
    .absolute()
    .left(left)
    .bottom(bottom)
    .w(width)
    .p(cardPadding)
    .gap(lineGap);
};

export const mixScene = (
  open: boolean,
  tokens: DirectionTokens,
  state: MixState = createMixState(),
): Element => {
  const scene = v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(attentionWindow({ variant: 'mix' }, tokens));

  const ask = state.asks[0];

  if (state.dismissed || ask === undefined) {
    return scene;
  }

  const listOpen = open || state.listOpen;
  const content = listOpen ? askList(state, tokens) : askLine(ask, state, tokens);
  const card = positionedCard(tokens).child(content);

  if (tokens.normal) {
    card.child(footerLine([['g', 'n'], 'Go to'], tokens));
  }

  return scene.child(card);
};
