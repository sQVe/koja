import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { footerLine, iconMark, overlayCard } from '../overlays/parts.ts';
import { fixedLabel, iconButton, styled } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { attentionWindow, hiddenAsks } from './data.ts';

const cardWidth = 320;
const cardInset = 26;
const cardPadding = 10;
const lineGap = 6;
const textInset = 20;
const footerInset = 12;

const cornerCard = (tokens: DirectionTokens): Element => {
  const ask = hiddenAsks[0];

  const spacer = h_flex().flex_1();
  const closeButton = iconButton('x', tokens, tokens.ink.dim).cursor_pointer();

  const title = h_flex()
    .gap(lineGap)
    .items_center()
    .child(iconMark('message-circle-question', tokens.marks.blocked))
    .child(fixedLabel(ask.space, tokens.text.title, tokens.ink.text))
    .child(spacer)
    .child(fixedLabel(ask.project, tokens.text.detail, tokens.ink.dim))
    .child(closeButton);

  const bodyContainer = div().ml(textInset).mr(lineGap);
  const body = styled(bodyContainer, tokens.text.body, tokens.ink.muted).child(ask.description);

  const card = overlayCard(tokens)
    .absolute()
    .right(cardInset)
    .bottom(cardInset)
    .w(cardWidth)
    .p(cardPadding)
    .gap(lineGap)
    .cursor_pointer()
    .child(title)
    .child(body);

  if (tokens.normal) {
    const footer = footerLine([['g', 'n'], 'Go to'], tokens).ml(footerInset);

    card.child(footer);
  }

  const moreAsks = fixedLabel('1 more ask', tokens.text.detail, tokens.ink.dim).ml(textInset).mt(2);

  return card.child(moreAsks);
};

export const cornerScene = (tokens: DirectionTokens): Element =>
  v_flex()
    .relative()
    .flex_1()
    .min_h(0)
    .child(attentionWindow({ variant: 'corner' }, tokens))
    .child(cornerCard(tokens));
