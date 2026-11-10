import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { iconSize } from '../../../../kit/size.ts';
import { withFloating } from '../floating.ts';
import { iconMark, overlayCard } from '../overlays/parts.ts';
import { uiFont } from '../parts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import { dialogActions } from './actions.ts';
import { askBody } from './bodies.ts';
import type { DialogAsk } from './content.ts';
import { askContent, spaceName } from './content.ts';
import { dialogBlockGap, quotedTitle, wrappedText } from './parts.ts';

const cardWidth = 360;
const cardPadding = 12;
const titleLineBoxTrim = 6;
const actionGroupGap = 12;
const markGap = 6;
const markedBodyInset = iconSize.small + markGap;
const titleMarkTop = 4;

const dialogTitle = (ask: DialogAsk, tokens: DirectionTokens): Element => {
  const content = askContent[ask];

  if (ask === 'rename') {
    return quotedTitle(content.title, spaceName, tokens);
  }

  const title = h_flex().gap(markGap).items_start();

  if (content.destructive) {
    title.child(iconMark('triangle-alert', tokens.marks.blocked).mt(titleMarkTop));
  }

  if (ask === 'wt-open') {
    title.pl(tokens.rows.paddingX);
  }

  return title.child(wrappedText(content.title, tokens.text.title, tokens.ink.text).flex_1());
};

const dialogDetail = (ask: DialogAsk, tokens: DirectionTokens): Element[] => {
  const { detail } = askContent[ask];

  if (detail.length === 0) {
    return [];
  }

  const lines = detail.map((line) => wrappedText(line, tokens.text.body, tokens.ink.muted));

  return [v_flex().children(lines)];
};

export const dialogLayer = (ask: DialogAsk, tokens: DirectionTokens): Element => {
  const body = v_flex()
    .gap(dialogBlockGap)
    .children(dialogDetail(ask, tokens))
    .children(askBody(ask, tokens));

  if (askContent[ask].destructive) {
    body.pl(markedBodyInset);
  }

  const card = overlayCard(tokens)
    .relative()
    .overflow_hidden()
    .w(cardWidth)
    .p(cardPadding)
    .pt(cardPadding - titleLineBoxTrim)
    .gap(dialogBlockGap)
    .child(dialogTitle(ask, tokens))
    .child(body)
    .child(dialogActions(ask, tokens).mt(actionGroupGap - dialogBlockGap));

  return v_flex()
    .absolute()
    .inset_0()
    .items_center()
    .justify_center()
    .bg('#00000059')
    .font_family(uiFont)
    .child(card);
};

export const dialogScene = (ask: DialogAsk, tokens: DirectionTokens): Element =>
  withFloating(mapSidebar, [dialogLayer(ask, tokens)], tokens);
