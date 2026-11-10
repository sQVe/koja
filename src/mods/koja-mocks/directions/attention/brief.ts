import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { footerLine, iconMark, mainLeft, overlayCard } from '../overlays/parts.ts';
import { fixedLabel, iconButton } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { attentionWindow, focusedPaneWidth, hiddenAsks } from './data.ts';

const cardWidth = 340;
const paneClearance = 16;
const cardPadding = 10;
const lineGap = 6;

const briefCard = (tokens: DirectionTokens): Element => {
  const ask = hiddenAsks[0];
  const prompt = `${ask.space} asks you`;

  const line = h_flex()
    .gap(lineGap)
    .items_center()
    .child(iconMark('message-circle-question', tokens.marks.blocked))
    .child(fixedLabel(prompt, tokens.text.body, tokens.ink.text))
    .child(fixedLabel(ask.project, tokens.text.detail, tokens.ink.dim))
    .child(h_flex().flex_1())
    .child(fixedLabel('1 more ask', tokens.text.detail, tokens.ink.dim))
    .child(iconButton('x', tokens, tokens.ink.dim));

  const paneLeft = mainLeft + tokens.areas.contentPadding;
  const left = paneLeft + (focusedPaneWidth(tokens) - cardWidth) / 2;
  const bottom = tokens.areas.contentPadding + paneClearance;

  const card = overlayCard(tokens)
    .absolute()
    .left(left)
    .bottom(bottom)
    .w(cardWidth)
    .p(cardPadding)
    .gap(lineGap)
    .child(line);

  if (tokens.normal) {
    card.child(footerLine([['g', 'n'], 'Go to'], tokens));
  }

  return card;
};

export const briefScene = (tokens: DirectionTokens): Element =>
  v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(attentionWindow({ variant: 'brief' }, tokens))
    .child(briefCard(tokens));
